package setting

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// dooy 2026-05-27 组管理员密码配置，格式 {"group-name":"password"}
var groupAdmins = map[string]string{}
var groupAdminsMutex sync.RWMutex

func GetGroupAdminsCopy() map[string]string {
	groupAdminsMutex.RLock()
	defer groupAdminsMutex.RUnlock()

	copy := make(map[string]string)
	for k, v := range groupAdmins {
		copy[k] = v
	}
	return copy
}

func GroupAdmins2JSONString() string {
	groupAdminsMutex.RLock()
	defer groupAdminsMutex.RUnlock()

	jsonBytes, err := common.Marshal(groupAdmins)
	if err != nil {
		common.SysLog("error marshalling group admins: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateGroupAdminsByJSONString(jsonStr string) error {
	groupAdminsMutex.Lock()
	defer groupAdminsMutex.Unlock()

	newMap := make(map[string]string)
	if err := common.Unmarshal([]byte(jsonStr), &newMap); err != nil {
		return err
	}
	groupAdmins = newMap
	return nil
}

func VerifyGroupAdmin(groupName, password string) bool {
	groupAdminsMutex.RLock()
	defer groupAdminsMutex.RUnlock()

	pwd, ok := groupAdmins[groupName]
	if !ok {
		return false
	}
	return pwd == password
}
