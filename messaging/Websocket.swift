import SwiftUI

class Websocket: ObservableObject {
    private var webSocketTask: URLSessionWebSocketTask?
    var token: String
    @Binding var chats: [String: Chat]

    init(chats: Binding<[String: Chat]>, token: String) {
        self._chats = chats
        self.token = token
        self.connect()
    }

    private func connect() {
        guard let url = URL(string: "wss://sigmalearning.academy:6503/ws") else { return }
        var request = URLRequest(url: url)
        request.setValue(token, forHTTPHeaderField: "Authorization")
        webSocketTask = URLSession.shared.webSocketTask(with: request)
        webSocketTask?.resume()
        receiveMessage()
    }

    enum SocketMessageData: Decodable {
        case message(Message)
        case chat(Chat)
        
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let message = try? container.decode(Message.self) {
                self = .message(message)
            } else if let chat = try? container.decode(Chat.self) {
                self = .chat(chat)
            } else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Data doesn't match any known type")
            }
        }
    }

    struct SocketMessage: Decodable {
        let type: String
        let chat: String
        let data: SocketMessageData
    }

    private func receiveMessage() {
        webSocketTask?.receive { result in
            switch result {
            case .failure(let error):
                print(error.localizedDescription)
            case .success(let message):
                switch message {
                case .string(let data):
                    if let jsonData = data.data(using: .utf8) {
                        let decoded = try? JSONDecoder().decode(SocketMessage.self, from: jsonData)
                        if let message = decoded {
                            switch message.data {
                            case .message(let newMessage):
                                withAnimation {
                                    self.chats[message.chat]?.messages.append(newMessage)
                                }
                            case .chat(let newChat):
                                withAnimation {
                                    self.chats[message.chat] = newChat
                                }
                            }
                        }
                    }
                    break
                case .data(_): break
                @unknown default:
                    break
                }
                self.receiveMessage()
            }
        }
    }
}
