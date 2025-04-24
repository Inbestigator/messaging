"use client";

import {
  base64ToArrayBuffer,
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
} from "@/enc";
import { useEffect, useState } from "react";
import Input from "@/components/input";
import Image from "next/image";
import Link from "next/link";
import { ecKey, exportKey, generateKey, importKey } from "@enc/core";
import { encodeBase64 } from "tweetnacl-util";

interface Message {
  id: string;
  content: string;
  isMe: boolean;
  timestamp: number;
  isSending?: boolean;
  key: string;
}

interface Chat {
  id: string;
  name: string;
  messages: Message[];
}

export default function Home() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : undefined;
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [selectedChat, setSelectedChat] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  useEffect(() => {
    if (token && !ws) {
      const ws = new WebSocket(
        `wss://sigmalearning.academy:6503/ws?token=${token}`
      );
      setWs(ws);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string) as
          | {
              type: "newMessage";
              data: Message;
              chat: string;
            }
          | {
              type: "newChat";
              data: Chat;
              chat: string;
            };
        const type = data.type;
        if (type === "newMessage") {
          setChats((chats) => {
            const chat = chats[data.chat]!;
            return {
              ...chats,
              [data.chat]: {
                ...chat,
                messages: [...chat.messages, data.data],
              },
            };
          });
        } else if (type === "newChat") {
          setChats((chats) => ({
            ...chats,
            [data.chat]: data.data,
          }));
        }
      };
    }
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [token, ws]);

  useEffect(() => {
    if (!token) {
      return;
    }
    fetch("https://sigmalearning.academy:6503/chats", {
      headers: {
        Authorization: token,
      },
    })
      .then(async (res) => {
        if (res.ok) {
          const chats = (await res.json()) as Record<string, Chat>;
          setChats(chats);
        }
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    async function loadMsgs() {
      if (!selectedChat || !token) {
        return;
      }
      const msgs: Message[] = [];
      await Promise.all(
        chats[selectedChat]?.messages.map(async (msg) => {
          const { derivedKey } = await getDerivedKey(
            selectedChat,
            token,
            msg.key
          );
          msgs.push({
            ...msg,
            content: await decryptMessage(msg.content, derivedKey),
          });
        }) ?? []
      );
      setMessages(msgs);
    }
    void loadMsgs();
  }, [chats, selectedChat, token]);

  if (!token) {
    return (
      <main className="absolute left-1/2 top-1/2 z-50 flex flex-col h-[20rem] w-full max-w-96 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-600">
        {navigator.platform === "MacIntel" && (
          <header className="flex w-full items-center justify-center bg-black/70 p-1 text-sm text-white/60 font-bold gap-1">
            Check out the native Mac app{" "}
            <Link className="underline" href="/app.zip">
              here
            </Link>
          </header>
        )}
        <nav className="flex size-full items-center justify-center bg-black/80 p-2 text-sm">
          <form
            action={async (f) => {
              const name = f.get("username") as string;
              const password = f.get("password") as string;
              const { privateKey, publicKey } = await generateKey(
                ecKey("Encrypting")
              );
              localStorage.setItem(
                "privateKey",
                encodeBase64(
                  new Uint8Array(await exportKey("pkcs8", privateKey))
                )
              );
              fetch("https://sigmalearning.academy:6503/users", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  publicKey: encodeBase64(
                    new Uint8Array(await exportKey("raw", publicKey))
                  ),
                  name,
                  password,
                }),
              })
                .then(async (res) => {
                  if (res.ok) {
                    const user = await res.text();
                    localStorage.setItem("username", name);
                    localStorage.setItem("token", user);
                    window.location.reload();
                  }
                })
                .catch(console.error);
            }}
            className="grid w-full grid-cols-[auto,1fr] gap-2 p-2 text-white/80"
          >
            Username
            <Input
              minLength={3}
              required
              maxLength={32}
              pattern="^[a-zA-Z-_]+$"
              name="username"
            />
            <div className="col-span-2" />
            Password
            <Input minLength={3} required type="password" name="password" />
            <div className="col-span-2" />
            <button
              type="submit"
              className="col-start-2 w-20 rounded-md bg-neutral-500 text-sm text-white items-center justify-center flex gap-1"
            >
              <Image
                src="/lock.open.fill.svg"
                alt="lock"
                width={14}
                height={14}
              />
              Log in
            </button>
          </form>
        </nav>
      </main>
    );
  }

  return (
    <main className="absolute left-1/2 top-1/2 z-50 flex h-[32rem] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-600">
      <nav className="relative size-full max-w-64 bg-black/80 p-2 text-sm">
        <div className="flex max-h-[29rem] flex-col gap-2 overflow-scroll">
          {Object.values(chats)
            .sort(
              (a, b) =>
                (b.messages.sort((a, b) => a.timestamp - b.timestamp)[0]
                  ?.timestamp ?? 0) -
                (a.messages.sort((a, b) => a.timestamp - b.timestamp)[0]
                  ?.timestamp ?? 0)
            )
            .map((chat) => (
              <button
                onClick={() => {
                  setSelectedChat(chat.id);
                }}
                key={chat.id}
                className={`w-full flex items-center gap-2 rounded-lg bg-${
                  selectedChat === chat.id ? "blue-500" : "transparent"
                } p-4 text-left font-semibold text-white`}
              >
                <Image
                  src="/person.fill.svg"
                  alt="person"
                  width={18}
                  height={18}
                />
                {chat.name}
              </button>
            ))}
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <p className="w-full text-end text-xs text-white/80">
            {localStorage.getItem("username") ?? "Unknown"}
          </p>
          <div className="flex gap-2">
            <form
              action={async (f) => {
                const name = f.get("name") as string;
                const res = await fetch(
                  "https://sigmalearning.academy:6503/chats",
                  {
                    method: "POST",
                    headers: {
                      Authorization: token,
                      "Content-Type": "application/json",
                    },
                    body: name,
                  }
                );
                if (!res.ok) {
                  return;
                }
                const chat = (await res.json()) as Chat;
                setChats((prev) => ({
                  ...prev,
                  [chat.id]: chat,
                }));
                setSelectedChat(chat.id);
              }}
            >
              <Input name="name" placeholder="New chat" />
            </form>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to sign out?\nAs opposed to on the Mac app, all previous messages will be lost."
                  )
                ) {
                  localStorage.removeItem("token");
                  localStorage.removeItem("privateKey");
                  localStorage.removeItem("username");
                  location.reload();
                }
              }}
              className="w-28 rounded-md bg-neutral-500 text-sm text-white items-center justify-center flex gap-1"
            >
              <Image src="/lock.fill.svg" alt="lock" width={14} height={14} />
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <article className="relative flex size-full flex-col gap-2 bg-black/75 p-2 text-sm">
        <div className="flex h-[29rem] w-full flex-col gap-2 overflow-y-scroll">
          {messages.map((message) => (
            <p
              key={message.id}
              className={
                message.isMe
                  ? "ml-auto w-fit rounded-lg bg-blue-500 p-1 px-2 text-white"
                  : "w-fit rounded-lg bg-slate-400 p-1 px-2"
              }
            >
              {message.content}
            </p>
          ))}
        </div>
        {selectedChat && (
          <form
            action={async (f) => {
              const message = f.get("message") as string;
              const chat = chats[selectedChat];
              if (!chat || !message.trim() || isSending) {
                return;
              }
              setIsSending(true);
              const { derivedKey, publicKey } = await getDerivedKey(
                selectedChat,
                token
              );
              const encryptedMessage = await encryptMessage(
                message,
                derivedKey
              );
              setChats((chats) => ({
                ...chats,
                [selectedChat]: {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      id: crypto.randomUUID(),
                      timestamp: Date.now(),
                      content: encryptedMessage,
                      isMe: true,
                      key: publicKey,
                    },
                  ],
                },
              }));
              await fetch(
                `https://sigmalearning.academy:6503/chats/${selectedChat}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: token,
                  },
                  body: JSON.stringify({
                    content: encryptedMessage,
                  }),
                }
              );
              setIsSending(false);
            }}
            className="absolute bottom-2 left-2 right-2"
          >
            <Input name="message" disabled={isSending} placeholder="Message" />
          </form>
        )}
      </article>
    </main>
  );
}

async function getDerivedKey(
  chatId: string,
  token: string,
  inputPublic?: string
) {
  if (!inputPublic) {
    const res = await fetch(
      `https://sigmalearning.academy:6503/chats/${chatId}/key`,
      {
        headers: {
          Authorization: token,
        },
      }
    );
    if (!res.ok) {
      throw new Error("Failed to get derived key");
    }
    inputPublic = await res.text();
  }
  const publicKey = await importKey(
    "raw",
    "public",
    base64ToArrayBuffer(inputPublic),
    ecKey("Encrypting")
  );
  const privateKey = await importKey(
    "pkcs8",
    "private",
    base64ToArrayBuffer(localStorage.getItem("privateKey")!),
    ecKey("Encrypting")
  );
  return {
    derivedKey: await deriveSharedKey(privateKey, publicKey),
    publicKey: inputPublic,
  };
}
