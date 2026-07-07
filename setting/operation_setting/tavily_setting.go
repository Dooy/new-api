package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// TavilySetting 保存 Tavily 搜索 API 的系统级配置。
// 当 Key 非空时，v1/messages relay 会拦截 web_search 工具调用并通过 Tavily 执行搜索。
type TavilySetting struct {
	// BaseURL Tavily API 根地址，默认 https://api.tavily.com
	BaseURL string `json:"base_url"`
	// Key Tavily API Key；为空时拦截功能不激活
	Key string `json:"key"`
}

var tavilySetting = TavilySetting{
	BaseURL: "https://api.tavily.com",
	Key:     "",
}

func init() {
	config.GlobalConfig.Register("tavily_setting", &tavilySetting)
}

// GetTavilyConfig 返回当前 Tavily 配置的指针。
func GetTavilyConfig() *TavilySetting {
	return &tavilySetting
}

// IsTavilyEnabled 当 Tavily API Key 已配置时返回 true。
func IsTavilyEnabled() bool {
	return tavilySetting.Key != ""
}
