import SwiftUI

struct Chat: Identifiable, Codable {
    let id: String
    let name: String
    var messages: [Message]
}

struct Message: Identifiable, Codable {
    let id: String
    let content: String
    let isMe: Bool
    let timestamp: Int
    let key: String
    var isSending: Bool?
}

func fetchChats(token: String) async -> [String: Chat] {
    guard let url = URL(string: "https://sigmalearning.academy:6503/chats") else {
        return [:]
    }

    var request = URLRequest(url: url)
    request.setValue(token, forHTTPHeaderField: "Authorization")

    do {
        let (data, _) = try await URLSession.shared.data(for: request)
        let chats = try JSONDecoder().decode([String: Chat].self, from: data)
        return chats
    } catch {
        print("Error fetching or decoding chats: \(error)")
        return [:]
    }
}

struct ContentView: View {
    @State var chats: [String: Chat] = [:]
    @EnvironmentObject private var appManager: AppManager

    var body: some View {
        HStack {
            SelectChatView(chats: $chats)
            ChatView(chats: $chats)
        }.frame(minWidth: 700, maxWidth: 700, minHeight: 500, maxHeight: 500)
        .onAppear {
            Task {
                let fetchedChats = await fetchChats(token: appManager.userToken)
                DispatchQueue.main.async {
                    self.chats = fetchedChats
                }
                let _ = Websocket(
                    chats: $chats, token: appManager.userToken)
            }
        }
    }
}
