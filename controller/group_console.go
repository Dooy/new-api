package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

// dooy 2026-05-27 组管理员控制台：验证组身份和查询组统计数据

type verifyGroupRequest struct {
	Group    string `json:"group" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func VerifyGroupAdmin(c *gin.Context) {
	var req verifyGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误：需要 group 和 password 字段",
		})
		return
	}

	if !setting.VerifyGroupAdmin(req.Group, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "组名或密码错误",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func GetGroupStat(c *gin.Context) {
	group := c.GetHeader("X-Group-Name")
	password := c.GetHeader("X-Group-Password")

	if group == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误：需要 X-Group-Name 和 X-Group-Password header",
		})
		return
	}

	if !setting.VerifyGroupAdmin(group, password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "组名或密码错误",
		})
		return
	}

	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	modelName := c.Query("model_name")

	// 强制使用已验证的 group，不允许客户端覆盖
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, "", "", 0, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
}

func GetGroupChartData(c *gin.Context) {
	group := c.GetHeader("X-Group-Name")
	password := c.GetHeader("X-Group-Password")

	if group == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误：需要 X-Group-Name 和 X-Group-Password header",
		})
		return
	}

	if !setting.VerifyGroupAdmin(group, password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "组名或密码错误",
		})
		return
	}

	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	data, err := model.GetQuotaDatesByGroup(group, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
}

// dooy end

// dooy 2026-05-27 获取组内用户余额列表，供组控制台用户余额面板使用
func GetGroupUsers(c *gin.Context) {
	group := c.GetHeader("X-Group-Name")
	password := c.GetHeader("X-Group-Password")

	if group == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误：需要 X-Group-Name 和 X-Group-Password header",
		})
		return
	}

	if !setting.VerifyGroupAdmin(group, password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "组名或密码错误",
		})
		return
	}

	users, err := model.GetUsersByGroup(group)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    users,
	})
}
// dooy end
