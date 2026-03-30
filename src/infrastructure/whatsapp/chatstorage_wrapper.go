package whatsapp

import (
	domainChatStorage "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/chatstorage"
	"go.mau.fi/whatsmeow/types"
)

// deviceChatStorage wraps a base repository and injects device_id into the handful
// of methods that need it. All other methods are promoted automatically via the
// embedded interface — no boilerplate delegation required.
type deviceChatStorage struct {
	deviceID string
	domainChatStorage.IChatStorageRepository // delegates all non-overridden methods
}

func newDeviceChatStorage(deviceID string, base domainChatStorage.IChatStorageRepository) domainChatStorage.IChatStorageRepository {
	if base == nil {
		return nil
	}
	return &deviceChatStorage{deviceID: deviceID, IChatStorageRepository: base}
}

func (r *deviceChatStorage) StoreChat(chat *domainChatStorage.Chat) error {
	if chat != nil && chat.DeviceID == "" {
		chat.DeviceID = r.deviceID
	}
	return r.IChatStorageRepository.StoreChat(chat)
}

func (r *deviceChatStorage) GetChat(jid string) (*domainChatStorage.Chat, error) {
	return r.IChatStorageRepository.GetChatByDevice(r.deviceID, jid)
}

func (r *deviceChatStorage) GetChats(filter *domainChatStorage.ChatFilter) ([]*domainChatStorage.Chat, error) {
	if filter != nil && filter.DeviceID == "" {
		filter.DeviceID = r.deviceID
	}
	return r.IChatStorageRepository.GetChats(filter)
}

func (r *deviceChatStorage) DeleteChat(jid string) error {
	return r.IChatStorageRepository.DeleteChatByDevice(r.deviceID, jid)
}

func (r *deviceChatStorage) GetMessages(filter *domainChatStorage.MessageFilter) ([]*domainChatStorage.Message, error) {
	if filter != nil && filter.DeviceID == "" {
		filter.DeviceID = r.deviceID
	}
	return r.IChatStorageRepository.GetMessages(filter)
}

func (r *deviceChatStorage) SearchMessages(deviceID, chatJID, searchText string, limit int) ([]*domainChatStorage.Message, error) {
	if deviceID == "" {
		deviceID = r.deviceID
	}
	return r.IChatStorageRepository.SearchMessages(deviceID, chatJID, searchText, limit)
}

func (r *deviceChatStorage) DeleteMessage(id, chatJID string) error {
	return r.IChatStorageRepository.DeleteMessageByDevice(r.deviceID, id, chatJID)
}

func (r *deviceChatStorage) GetChatMessageCount(chatJID string) (int64, error) {
	return r.IChatStorageRepository.GetChatMessageCountByDevice(r.deviceID, chatJID)
}

func (r *deviceChatStorage) GetFilteredChatCount(filter *domainChatStorage.ChatFilter) (int64, error) {
	if filter != nil && filter.DeviceID == "" {
		filter.DeviceID = r.deviceID
	}
	return r.IChatStorageRepository.GetFilteredChatCount(filter)
}

func (r *deviceChatStorage) GetChatNameWithPushName(jid types.JID, chatJID string, senderUser string, pushName string) string {
	return r.IChatStorageRepository.GetChatNameWithPushNameByDevice(r.deviceID, jid, chatJID, senderUser, pushName)
}

func (r *deviceChatStorage) DeleteDeviceData(deviceID string) error {
	if deviceID == "" {
		deviceID = r.deviceID
	}
	return r.IChatStorageRepository.DeleteDeviceData(deviceID)
}
