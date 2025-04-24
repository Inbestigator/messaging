//
//  ChatView.swift
//  messaging
//
import SwiftUI

struct KeyCacheEntry {
    let date: Date
    let key: String
}

struct ChatView: View {
    @Binding var chats: [String: Chat]
    @State var publicKey: String?
    @State private var typingMessage: String = ""
    @EnvironmentObject private var appManager: AppManager
    @State private var keyCache: [String: KeyCacheEntry] = [:]

    func checkKeyCache(id: String, token: String) {
        let currentTime = Date()
        if let lastFetchedTime = keyCache[id]?.date,
            currentTime.timeIntervalSince(lastFetchedTime) < 300
        {
            publicKey = keyCache[id]?.key
        } else {
            publicKey = fetchPublicKey(id: id, token: token)
            keyCache[id] = KeyCacheEntry(
                date: currentTime, key: publicKey ?? "")
        }
    }

    func addMessage() {
        if let chat = chats[appManager.selectedChat], !typingMessage.isEmpty {
            var updatedChat = chat
            let publicKeyString = fetchPublicKey(id: chat.id, token: appManager.userToken)
            let encryptedContent = encryptMessage(
                str: typingMessage,
                username: appManager.username, publicKeyString: publicKeyString ?? ""
            )
            if encryptedContent.isEmpty {
                return
            }
            let newMessage = Message(
                id: UUID().uuidString,
                content: encryptedContent,
                isMe: true,
                timestamp: Int(Date().timeIntervalSince1970 * 1000),
                key: publicKeyString ?? "",
                isSending: true
            )
            updatedChat.messages.append(newMessage)

            withAnimation {
                chats[appManager.selectedChat] = updatedChat
            }

            guard
                let jsonData = try? JSONSerialization.data(withJSONObject: [
                    "content": newMessage.content
                ])
            else {
                print("Failed to convert message to JSON")
                return
            }

            guard
                let url = URL(
                    string:
                        "https://sigmalearning.academy:6503/chats/\(appManager.selectedChat)"
                )
            else { return }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(
                "application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(
                appManager.userToken, forHTTPHeaderField: "Authorization")
            request.httpBody = jsonData

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("Failed to post message: \(error)")
                    return
                }

                DispatchQueue.main.async {
                    withAnimation {
                        let updatedChat = chats[appManager.selectedChat]!
                        if let index = updatedChat.messages.firstIndex(where: {
                            $0.id == newMessage.id
                        }) {
                            chats[appManager.selectedChat]!.messages[index]
                                .isSending =
                                false
                        }
                    }
                }
            }.resume()

            typingMessage = ""
        }
    }

    var body: some View {
        VStack {
            if let chat = chats[appManager.selectedChat] {
                ScrollViewReader { scrollProxy in
                    ScrollView(.vertical) {
                        VStack(spacing: 4) {
                            ForEach(chat.messages) { message in
                                MessageView(
                                    message: message,
                                    username: appManager.username,
                                    otherPublic: publicKey)
                            }
                        }
                    }
                    .onChange(of: chat.messages.count) { _, _ in
                        scrollProxy.scrollTo(chat.messages.last?.id)
                    }

                    TextField(
                        "Message", text: $typingMessage, axis: .vertical
                    )
                    .lineLimit(10)
                    .onSubmit {
                        addMessage()
                    }
                }
                .onAppear {
                    checkKeyCache(id: chat.id, token: appManager.userToken)
                }
                .onChange(of: chat.id) {
                    old, new in
                    checkKeyCache(id: new, token: appManager.userToken)
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.trailing, 8)
        .frame(
            maxWidth: .infinity, maxHeight: .infinity,
            alignment: .bottomLeading)
    }
}

struct MessageView: View {
    var message: Message
    var username: String
    let otherPublic: String?

    var body: some View {
        HStack {
            if message.isMe {
                Spacer()
            }
            Text(
                decryptMessage(
                    message: message, username: username,
                    otherPublic: otherPublic)
            )
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(message.isMe ? .blue : .gray)
            .cornerRadius(10)
            .foregroundColor(message.isMe ? .white : .black)
        }
        .frame(
            maxWidth: .infinity,
            alignment: message.isMe
                ? .trailing : .leading
        )
        .id(message.id)
        .opacity((message.isSending ?? false) ? 0.5 : 1)
    }
}
