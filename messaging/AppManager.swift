//
//  AppRootManager.swift
//  messaging
//

import CryptoKit
import Foundation

final class AppManager: ObservableObject {
    @Published var currentRoot: eAppRoots = .login
    @Published var userToken: String = ""
    @Published var username: String = ""
    @Published var selectedChat: String = ""
    @Published var privateKey: P256.KeyAgreement.PrivateKey?

    enum eAppRoots {
        case login
        case home
    }
}
