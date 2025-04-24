//
//  messagingApp.swift
//  messaging
//

import SwiftUI

@main
struct messagingApp: App {
    @ObservedObject private var appManager = AppManager()

    var body: some Scene {
        WindowGroup {
            if appManager.currentRoot == .login {
                LoginView()
            } else {
                ContentView()
            }
        }.environmentObject(appManager).windowResizability(.contentSize)
    }
}
