package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetStatusLogs(c *gin.Context) {
	prStr := c.DefaultQuery("pr", "0.2")
	threshold, err := strconv.ParseFloat(prStr, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pr parameter"})
		return
	}

	var logs []model.Log
	model.LOG_DB.Model(&model.Log{}).
		Select("id", "type").
		Order("id desc").
		Limit(200).
		Find(&logs)

	total := len(logs)
	if total == 0 {
		c.JSON(http.StatusOK, gin.H{"ratio": 0})
		return
	}

	errCount := 0
	for _, l := range logs {
		if l.Type == model.LogTypeError {
			errCount++
		}
	}

	ratio := float64(errCount) / float64(total)
	if ratio > threshold {
		c.JSON(http.StatusInternalServerError, gin.H{"ratio": ratio})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ratio": ratio})
}
