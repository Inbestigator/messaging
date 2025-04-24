import KeychainSwift
import SwiftUI

struct LoginView: View {
    @State private var username: String = ""
    @State private var password: String = ""
    @State private var userExists: Bool = false
    @State private var showUserHelper: Bool = false
    @State private var showPassHelper: Bool = false
    @EnvironmentObject private var appManager: AppManager
    let keychain = KeychainSwift()

    var body: some View {
        Form {
            TextField("Username", text: $username)
            Text(
                userExists
                    ? "Username and password do not match"
                    : "Must be between 3 and 32 characters. Only use a-Z, A-Z, -, _"
            )
            .font(.footnote).foregroundStyle(.red).opacity(
                showUserHelper ? 1 : 0)
            SecureField("Password", text: $password)
            Text("Must be greater than 3 characters").font(.footnote)
                .foregroundStyle(.red).opacity(showPassHelper ? 1 : 0)
            Button("Log in", systemImage: "lock.open.fill") {
                loginUser()
            }
        }
        .onSubmit {
            loginUser()
        }
        .padding()
        .frame(minWidth: 400, maxWidth: 400, minHeight: 300, maxHeight: 300)
        .background(VisualEffectView())
    }

    private func loginUser() {
        guard let url = URL(string: "https://sigmalearning.academy:6503/users") else {
            return
        }

        let privateKey = privateKeyFromString(
            keychain.get("\(username.lowercased())-privateKey")
                ?? generatePrivateKey().rawRepresentation.base64EncodedString())!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "name": username, "password": password,
            "publicKey": privateKey.publicKey.rawRepresentation
                .base64EncodedString(),
        ]

        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            print("Failed to encode request body: \(error)")
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Request error: \(error)")
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                print("Invalid response")
                return
            }

            guard httpResponse.statusCode == 200 else {
                print("Server error: \(httpResponse.statusCode)")
                if httpResponse.statusCode == 401 {
                    userExists = true
                    withAnimation {
                        showUserHelper = true
                        showPassHelper = false
                    }
                } else {
                    userExists = false
                    withAnimation {
                        showUserHelper = true
                        showPassHelper = true
                    }
                }
                return
            }

            guard let data = data else {
                print("No data in response")
                return
            }

            if let token = String(data: data, encoding: .utf8) {
                DispatchQueue.main.async {
                    keychain.set(
                        privateKey.rawRepresentation.base64EncodedString(),
                        forKey: "\(username.lowercased())-privateKey")
                    appManager.userToken = token
                    appManager.currentRoot = .home
                    appManager.privateKey = privateKey
                    appManager.username = username
                }
            } else {
                print("Failed to decode token")
            }
        }.resume()
    }
}

#Preview {
    LoginView().environmentObject(AppManager())
}
