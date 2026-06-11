package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/gin-gonic/gin"
)

func SetStatusLogsRouter(router *gin.Engine) {
	router.GET("/api/status/logs", controller.GetStatusLogs)
}
