package service

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// tavilySearchRequest 是发送给 Tavily /search 接口的请求体。
type tavilySearchRequest struct {
	//APIKey      string `json:"api_key"`
	Query       string `json:"query"`
	SearchDepth string `json:"search_depth"`
	MaxResults  int    `json:"max_results"`
}

// tavilySearchResult 是 Tavily 返回的单条搜索结果。
type tavilySearchResult struct {
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
}

// tavilySearchResponse 是 Tavily /search 接口的响应体。
type tavilySearchResponse struct {
	Results []tavilySearchResult `json:"results"`
	Answer  string               `json:"answer"`
}

// TavilySearch 通过 Tavily API 执行搜索，返回格式化的纯文本结果。
// 超时为 10 秒；失败时返回描述性 error。
func TavilySearch(query string) (string, error) {
	cfg := operation_setting.GetTavilyConfig()
	if cfg.Key == "" {
		return "", fmt.Errorf("tavily: API key not configured")
	}

	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	endpoint := baseURL + "/search"

	reqBody := tavilySearchRequest{
		//APIKey:      cfg.Key,
		Query:       query,
		SearchDepth: "basic",
		MaxResults:  5,
	}
	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("tavily: failed to marshal request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("tavily: failed to build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.Key)

	resp, err := GetHttpClient().Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("tavily: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("tavily: upstream returned HTTP %d", resp.StatusCode)
	}

	var searchResp tavilySearchResponse
	if err := common.DecodeJson(resp.Body, &searchResp); err != nil {
		return "", fmt.Errorf("tavily: failed to decode response: %w", err)
	}

	return formatTavilyResults(&searchResp), nil
}

// formatTavilyResults 将搜索结果格式化为适合作为 tool_result 的纯文本。
func formatTavilyResults(resp *tavilySearchResponse) string {
	var sb strings.Builder

	if resp.Answer != "" {
		sb.WriteString("Summary: ")
		sb.WriteString(resp.Answer)
		sb.WriteString("\n\n")
	}

	for i, result := range resp.Results {
		fmt.Fprintf(&sb, "[%d] %s\nURL: %s\n%s\n\n", i+1, result.Title, result.URL, result.Content)
	}

	text := strings.TrimSpace(sb.String())
	if text == "" {
		return "No results found."
	}
	return text
}
