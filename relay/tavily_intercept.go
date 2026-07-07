package relay

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const tavilyMaxLoopTurns = 5

// tavilyLoopResult 是 runTavilyAgentLoop 的返回值。
type tavilyLoopResult struct {
	// FinalRequest 是追加了所有 tool_result 消息后的最终请求，交还给 ClaudeHelper 继续正常流程。
	FinalRequest *dto.ClaudeRequest
	// IntermediateUsage 是所有中间轮次累积的 token 用量。
	IntermediateUsage *dto.Usage
	// TavilyCallCount 是实际调用 Tavily 的次数，用于写入计费上下文。
	TavilyCallCount int
}

// hasTavilyServerTool 判断请求工具列表中是否包含 web_search_20250306 服务端工具。
func hasTavilyServerTool(req *dto.ClaudeRequest) bool {
	if req == nil || req.Tools == nil {
		//common.SysLog("hasTavilyServerTool req is nil")
		return false
	}
	tools := req.GetTools()
	if len(tools) == 0 {
		//common.SysLog("hasTavilyServerTool tools is nil")
		return false
	}
	str := common.GetJsonString(req.Tools)
	//common.SysLog(fmt.Sprintf("rep tools: %v", str))
	is := strings.Contains(str, "web_search_20250305")
	if is {
		common.SysLog(fmt.Sprintf("hasTavilyServerTool tools: %v", str))
	}
	return is

	//dto.ProcessTools 函数有问题 webTools 一定是 normalTools
	// normalTools, webTools := dto.ProcessTools(tools)
	// toolCount := len(webTools)
	// common.SysLog(fmt.Sprintf(" hasTavilyServerTool Count: %d", toolCount))
	// return toolCount > 0
}

// replaceTavilyServerTool 将请求中的 web_search_20250306 服务端工具替换为等价的用户侧工具定义。
// 替换后，上游以 tool_use content block 返回搜索意图，由网关代为调用 Tavily 执行。
func replaceTavilyServerTool(req *dto.ClaudeRequest) {
	if req == nil || req.Tools == nil {
		return
	}

	userTools, _ := dto.ProcessTools(req.GetTools())

	webSearchUserTool := &dto.Tool{
		Name:        "web_search",
		Description: "Search the web for up-to-date information. Use this tool when you need current or recent information.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"query": map[string]interface{}{
					"type":        "string",
					"description": "The search query",
				},
			},
			"required": []string{"query"},
		},
	}

	// 保留原有用户侧工具，追加用户侧 web_search 定义
	newTools := make([]any, 0, len(userTools)+1)
	for _, t := range userTools {
		newTools = append(newTools, t)
	}
	newTools = append(newTools, webSearchUserTool)
	req.Tools = newTools
}

// doTavilyIntermediateRequest 以非流式方式向上游发出一个中间轮次请求，
// 返回解析后的 ClaudeResponse。不向 gin.Context 写任何输出。
func doTavilyIntermediateRequest(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	adaptor channel.Adaptor,
	req *dto.ClaudeRequest,
) (*dto.ClaudeResponse, error) {
	// 强制非流式，避免 DoApiRequest 设置 SSE headers
	reqCopy, err := common.DeepCopy(req)
	if err != nil {
		return nil, fmt.Errorf("tavily loop: deep copy request: %w", err)
	}
	reqCopy.Stream = common.GetPointer(false)

	// 复制 info 并关闭流式标志，防止触发 SSE 初始化
	infoCopy := *info
	infoCopy.IsStream = false

	// 经渠道适配器转换请求格式（如 AWS Bedrock 格式转换等）
	convertedReq, err := adaptor.ConvertClaudeRequest(c, &infoCopy, reqCopy)
	if err != nil {
		return nil, fmt.Errorf("tavily loop: convert request: %w", err)
	}

	jsonData, err := common.Marshal(convertedReq)
	if err != nil {
		return nil, fmt.Errorf("tavily loop: marshal request: %w", err)
	}

	httpResp, err := channel.DoApiRequest(adaptor, c, &infoCopy, bytes.NewReader(jsonData))
	if err != nil {
		return nil, fmt.Errorf("tavily loop: do request: %w", err)
	}
	defer service.CloseResponseBodyGracefully(httpResp)

	if httpResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tavily loop: upstream HTTP %d", httpResp.StatusCode)
	}

	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("tavily loop: read response: %w", err)
	}

	var claudeResp dto.ClaudeResponse
	if err := common.Unmarshal(body, &claudeResp); err != nil {
		return nil, fmt.Errorf("tavily loop: parse response: %w", err)
	}
	return &claudeResp, nil
}

// runTavilyAgentLoop 执行 Tavily web_search agentic 循环。
// 每轮以非流式调用上游，当 stop_reason 不再是 "tool_use" 时退出。
// 返回值中的 FinalRequest 包含所有历史消息，交还给 ClaudeHelper 发起最终（流式）请求。
func runTavilyAgentLoop(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	adaptor channel.Adaptor,
	req *dto.ClaudeRequest,
) (*tavilyLoopResult, error) {
	result := &tavilyLoopResult{
		IntermediateUsage: &dto.Usage{},
	}

	// 深拷贝请求，避免污染调用方持有的原始对象
	workReq, err := common.DeepCopy(req)
	if err != nil {
		return nil, fmt.Errorf("tavily loop: initial deep copy: %w", err)
	}

	for turn := 0; turn < tavilyMaxLoopTurns; turn++ {
		claudeResp, err := doTavilyIntermediateRequest(c, info, adaptor, workReq)
		if err != nil {
			return nil, err
		}

		// 累加中间轮次 token 用量
		if claudeResp.Usage != nil {
			result.IntermediateUsage.PromptTokens += claudeResp.Usage.InputTokens
			result.IntermediateUsage.CompletionTokens += claudeResp.Usage.OutputTokens
		}

		// 非 tool_use 停止原因 → 循环结束，workReq 即最终请求
		if claudeResp.StopReason != "tool_use" {
			result.FinalRequest = workReq
			return result, nil
		}

		// 收集本轮所有 web_search tool_use 块
		var toolUseBlocks []dto.ClaudeMediaMessage
		for _, block := range claudeResp.Content {
			if block.Type == "tool_use" && block.Name == "web_search" {
				toolUseBlocks = append(toolUseBlocks, block)
			}
		}

		if len(toolUseBlocks) == 0 {
			// stop_reason=tool_use 但没有 web_search block，退出循环
			result.FinalRequest = workReq
			return result, nil
		}

		// 将 assistant 响应追加到对话历史
		workReq.Messages = append(workReq.Messages, dto.ClaudeMessage{
			Role:    "assistant",
			Content: claudeResp.Content,
		})

		// 构建 tool_result 用户消息
		toolResults := make([]dto.ClaudeMediaMessage, 0, len(toolUseBlocks))
		for _, block := range toolUseBlocks {
			query := extractTavilyQuery(block.Input)
			searchResult, searchErr := service.TavilySearch(query)
			result.TavilyCallCount++

			toolResult := dto.ClaudeMediaMessage{
				Type:      "tool_result",
				ToolUseId: block.Id,
			}
			if searchErr != nil {
				logger.LogWarn(c, fmt.Sprintf("tavily search failed (turn %d): %s", turn+1, searchErr.Error()))
				toolResult.Content = fmt.Sprintf("Search failed: %s", searchErr.Error())
			} else {
				toolResult.Content = searchResult
			}
			toolResults = append(toolResults, toolResult)
		}

		workReq.Messages = append(workReq.Messages, dto.ClaudeMessage{
			Role:    "user",
			Content: toolResults,
		})
	}

	// 达到最大轮次上限
	logger.LogWarn(c, fmt.Sprintf("tavily loop: reached max turns (%d), returning last state", tavilyMaxLoopTurns))
	result.FinalRequest = workReq
	return result, nil
}

// extractTavilyQuery 从 tool_use 的 Input 字段中提取搜索查询字符串。
// Input 在解析后通常为 map[string]interface{}，key 为 "query"。
func extractTavilyQuery(input any) string {
	if input == nil {
		return ""
	}
	if m, ok := input.(map[string]interface{}); ok {
		if q, ok := m["query"].(string); ok {
			return q
		}
	}
	// 兜底：尝试 JSON 序列化后再提取
	if b, err := common.Marshal(input); err == nil {
		var m map[string]interface{}
		if err := common.Unmarshal(b, &m); err == nil {
			if q, ok := m["query"].(string); ok {
				return q
			}
		}
	}
	return ""
}
