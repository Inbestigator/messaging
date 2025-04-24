//
//  Encryption.swift
//  messaging
//

import CryptoKit
import Foundation
import KeychainSwift

func fetchPublicKey(id: String, token: String) -> String? {
    let url = URL(string: "https://sigmalearning.academy:6503/chats/\(id)/key")!
    var publicKeyString: String?
    let semaphore = DispatchSemaphore(value: 0)

    var request = URLRequest(url: url)
    request.setValue(token, forHTTPHeaderField: "Authorization")

    let task = URLSession.shared.dataTask(with: request) {
        data, response, error in
        if let error = error {
            print("Error fetching public key: \(error)")
        } else if let data = data,
            let fetchedPublicKey = String(data: data, encoding: .utf8)
        {
            publicKeyString = fetchedPublicKey
        }
        semaphore.signal()
    }

    task.resume()
    semaphore.wait()

    return publicKeyString
}

func encryptMessage(str: String, username: String, publicKeyString: String)
    -> String
{
    do {
        let keychain = KeychainSwift()
        guard
            let privateKeyString = keychain.get(
                "\(username.lowercased())-privateKey"),
            let privateKey = privateKeyFromString(privateKeyString),
            let otherPubKey = publicKeyFromString(publicKeyString)
        else {
            return ""
        }

        let sharedKey = deriveShared(
            privateKey: privateKey, peerPublicKey: otherPubKey)

        let messageData = str.data(using: .utf8)!
        let sealedBox = try ChaChaPoly.seal(messageData, using: sharedKey)
        let encryptedData = sealedBox.combined

        return encryptedData.base64EncodedString()
    } catch {
        print("Encryption error: \(error)")
        return ""
    }
}

func decryptMessage(message: Message, username: String, otherPublic: String?)
    -> String
{
    let keychain = KeychainSwift()
    guard
        let privateKeyString = keychain.get(
            "\(username.lowercased())-privateKey"),
        let privateKey = privateKeyFromString(privateKeyString),
        let otherPubKey = publicKeyFromString(message.key)
    else {
        return "Error decoding"
    }
    let sharedKey = deriveShared(
        privateKey: privateKey, peerPublicKey: otherPubKey)
    do {
        if let decodedData = Data(base64Encoded: message.content) {
            let sealedBoxFromEncryptedData = try ChaChaPoly.SealedBox(
                combined: decodedData)
            let decryptedData = try ChaChaPoly.open(
                sealedBoxFromEncryptedData, using: sharedKey)

            if let decryptedStr = String(data: decryptedData, encoding: .utf8) {
                return decryptedStr
            }
        }
    } catch {
        print(error)
    }

    return "Error decoding"
}

func generatePrivateKey() -> P256.KeyAgreement.PrivateKey {
    return P256.KeyAgreement.PrivateKey()
}

func deriveShared(
    privateKey: P256.KeyAgreement.PrivateKey,
    peerPublicKey: P256.KeyAgreement.PublicKey
) -> SymmetricKey {
    let sharedSecret = try! privateKey.sharedSecretFromKeyAgreement(
        with: peerPublicKey)
    return sharedSecret.hkdfDerivedSymmetricKey(
        using: SHA256.self,
        salt: "Salt".data(using: .utf8)!,
        sharedInfo: Data(),
        outputByteCount: 32)
}

func privateKeyFromString(_ keyString: String) -> P256.KeyAgreement.PrivateKey? {
    guard let keyData = Data(base64Encoded: keyString) else {
        return nil
    }

    do {
        let privateKey = try P256.KeyAgreement.PrivateKey(
            rawRepresentation: keyData)
        return privateKey
    } catch {
        return nil
    }
}

func publicKeyFromString(_ keyString: String) -> P256.KeyAgreement.PublicKey? {
    guard let keyData = Data(base64Encoded: keyString) else {
        return nil
    }

    var modifiedKeyData = keyData

    if keyData.count == 65 {
        modifiedKeyData = keyData.subdata(in: 1..<keyData.count)
    }

    do {
        let publicKey = try P256.KeyAgreement.PublicKey(
            rawRepresentation: modifiedKeyData)
        return publicKey
    } catch {
        return nil
    }
}
