import KeychainSwift
import SwiftUI

struct SelectChatView: View {
    @Binding var chats: [String: Chat]
    @EnvironmentObject private var appManager: AppManager
    @State private var newChatName: String = ""

    var body: some View {
        VStack {
            ScrollView {
                ForEach(
                    Array(chats.values).sorted(by: {
                        ($0.messages.max(by: { $0.timestamp < $1.timestamp })?
                            .timestamp ?? 0)
                            > ($1.messages.max(by: {
                                $0.timestamp < $1.timestamp
                            })?.timestamp ?? 0)
                    }), id: \.id
                ) { chat in ChatButtonView(chat: chat)
                }
            }
            Spacer()
            Text(appManager.username).font(.subheadline).frame(
                width: 250, alignment: .trailing
            )
            .lineLimit(1)
            HStack {
                TextField("New chat", text: $newChatName).onSubmit {
                    createChat(with: newChatName)
                }
                Button("Sign out", systemImage: "lock.fill") {
                    appManager.userToken = ""
                    appManager.username = ""
                    appManager.privateKey = nil
                    appManager.selectedChat = ""
                    appManager.currentRoot = .login
                }
            }
        }
        .frame(maxWidth: 250, maxHeight: .infinity, alignment: .top)
        .padding(8)
        .background(VisualEffectView().ignoresSafeArea())
    }

    func createChat(with name: String) {
        guard let url = URL(string: "https://sigmalearning.academy:6503/chats")
        else {
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(
            appManager.userToken, forHTTPHeaderField: "Authorization")
        request.httpBody = name.data(using: .utf8)

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Request failed with error: \(error)")
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                print("Invalid response")
                return
            }

            guard httpResponse.statusCode == 200 else {
                print("Server error: \(httpResponse.statusCode)")
                return
            }

            if let data = data {
                do {
                    let chat = try JSONDecoder().decode(Chat.self, from: data)
                    chats[chat.id] = chat
                    newChatName = ""
                } catch {
                    print(error)
                }
            }
        }.resume()
    }
}

struct ChatButtonView: View {
    var chat: Chat
    @EnvironmentObject private var appManager: AppManager

    var body: some View {
        Button(action: {
            appManager.selectedChat = chat.id
        }) {
            HStack {
                Image(systemName: "person.fill").imageScale(.large)
                Text(chat.name).font(.headline)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .buttonStyle(BorderlessButtonStyle())
        .foregroundStyle(.primary)
        .background(appManager.selectedChat == chat.id ? .blue : .clear)
        .cornerRadius(8)
    }
}

#Preview {
    @Previewable @State var selectedChat: String = ""
    @Previewable @State var chats: [String: Chat] = [
        "1": Chat(id: "1", name: "Test", messages: []),
        "2": Chat(id: "2", name: "Test2", messages: []),
    ]
    @ObservedObject var appManager = AppManager()
    SelectChatView(chats: $chats)
        .environmentObject(appManager)
}
