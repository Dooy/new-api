package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

// NormalizeCacheTokensInOAIUsage merges cache read/write tokens into PromptTokens
// for OpenAI-format usage structs, then zeroes the cache detail fields.
//
// Claude semantics: InputTokens excludes cache tokens, so we add them.
// GPT semantics: PromptTokens already includes cache tokens, so we only zero the detail fields.
//
// The function is idempotent — if cache fields are already zero, it is a no-op.
func NormalizeCacheTokensInOAIUsage(usage *dto.Usage, isClaudeSemantic bool) {
	if !common.CacheTokenAsInputEnabled || usage == nil {
		return
	}
	cacheRead := usage.PromptTokensDetails.CachedTokens
	cacheWrite := usage.PromptTokensDetails.CachedCreationTokens
	if cacheRead == 0 && cacheWrite == 0 {
		return
	}
	if isClaudeSemantic {
		usage.PromptTokens += cacheRead + cacheWrite
	}
	usage.PromptTokensDetails.CachedTokens = 0
	usage.PromptTokensDetails.CachedCreationTokens = 0
	usage.ClaudeCacheCreation5mTokens = 0
	usage.ClaudeCacheCreation1hTokens = 0
}

// NormalizeCacheTokensInClaudeUsage merges cache read/write tokens into InputTokens
// for Claude-format usage structs, then zeroes the cache fields.
//
// The function is idempotent — if cache fields are already zero, it is a no-op.
func NormalizeCacheTokensInClaudeUsage(usage *dto.ClaudeUsage) {
	if !common.CacheTokenAsInputEnabled || usage == nil {
		return
	}
	cacheRead := usage.CacheReadInputTokens
	cacheWrite := usage.CacheCreationInputTokens
	if cacheRead == 0 && cacheWrite == 0 {
		return
	}
	usage.InputTokens += cacheRead + cacheWrite
	usage.CacheReadInputTokens = 0
	usage.CacheCreationInputTokens = 0
	usage.CacheCreation = nil
	usage.ClaudeCacheCreation5mTokens = 0
	usage.ClaudeCacheCreation1hTokens = 0
}
