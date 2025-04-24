import { hashSha256 } from "@frytg/crypto/hash";

interface User {
  id: number;
  name: string;
  password: string;
  token: string;
  publicKey: string;
  chats: string[]; // Chat IDs
}

interface Message {
  id: string;
  text: string;
  timestamp: number;
  author: number; // User ID
  keysUsed: string[];
}

interface Chat {
  id: string;
  messages: Message[];
  members: Set<number>; // User IDs
}

const chatsJson = (() => {
  try {
    return Deno.readTextFileSync("chats.json");
  } catch {
    return "[]";
  }
})();
const usersJson = (() => {
  try {
    return Deno.readTextFileSync("users.json");
  } catch {
    return "[]";
  }
})();

const users: Map<number, User> = new Map(
  JSON.parse(usersJson).map((user: User) => [user.id, user]),
);
const chats: Map<string, Chat> = new Map(
  JSON.parse(chatsJson).map((chat: Chat) => [chat.id, {
    ...chat,
    members: new Set(chat.members),
  }]),
);
const userSockets: Map<number, WebSocket> = new Map();

const getUserByToken = (token: string | null) => {
  for (const user of users.values()) {
    if (user.token === token) return user;
  }
  return null;
};

const getChatById = (chatId: string) => chats.get(chatId);

const allowedOrigins = [
  "https://massaging.vercel.app",
  "https://ee2e.vercel.app",
  "https://etoe.vercel.app",
  "https://etoee.vercel.app",
  "http://localhost:3000",
];

const corsHeaders = (req: Request) => ({
  headers: {
    "Access-Control-Allow-Origin":
      allowedOrigins.includes(req.headers.get("Origin") ?? "")
        ? req.headers.get("Origin") ?? ""
        : "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  },
});

Deno.serve(
  {
    port: 6503,
    cert: Deno.readTextFileSync("fullchain.pem"),
    key: Deno.readTextFileSync("privkey.pem"),
  },
  async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, corsHeaders(req));
    }
    const url = new URL(req.url);
    let token = req.headers.get("Authorization");
    if (!token && url.pathname === "/ws") {
      token = url.searchParams.get("token");
    }
    const user = getUserByToken(token);

    if (!user) {
      if (url.pathname === "/json") {
        Deno.writeTextFileSync(
          "users.json",
          JSON.stringify([...users.values().map((u) => u)]),
        );
        Deno.writeTextFileSync(
          "chats.json",
          JSON.stringify(
            [
              ...chats.values().map((u) => ({
                id: u.id,
                messages: u.messages,
                members: [...u.members.values()],
              })),
            ],
          ),
        );
        return new Response(
          "Done",
        );
      }
      if (url.pathname === "/users" && req.method === "POST") {
        const { name, password, publicKey } = await req.json() as {
          name: string;
          password: string;
          publicKey: string;
        };
        const existingUser = [...users.values()].find((u) =>
          u.name.toLowerCase() === name.toLowerCase()
        );
        if (existingUser) {
          if (existingUser.password !== hashSha256(password)) {
            return new Response("Unauthorized", {
              status: 401,
              ...corsHeaders(req),
            });
          }
          existingUser.publicKey = publicKey;
          return new Response(existingUser.token, corsHeaders(req));
        }
        if (
          name.length < 3 || password.length < 3 || !publicKey ||
          name.length > 32 || /[^a-zA-Z-_]/.test(name)
        ) {
          return new Response("Error in request", {
            status: 400,
            ...corsHeaders(req),
          });
        }

        const newUser = {
          id: users.size + 1,
          name,
          password: hashSha256(password),
          token: crypto.randomUUID(),
          publicKey,
          chats: [],
        };
        users.set(newUser.id, newUser);
        return new Response(newUser.token, corsHeaders(req));
      }
      return new Response("Unauthorized", { status: 401, ...corsHeaders(req) });
    }

    const keyMatch = /\/chats\/([^\/]+)\/key$/.exec(url.pathname);
    const chatMatch = /\/chats\/([^\/]+)$/.exec(url.pathname);

    if (chatMatch) {
      const chatId = chatMatch[1];
      const chat = getChatById(chatId);
      if (!chat || !chat.members.has(user.id)) {
        return new Response("Not found", { status: 404, ...corsHeaders(req) });
      }
      switch (req.method) {
        case "POST": {
          const { content } = await req.json();
          const messageId = crypto.randomUUID();
          const timestamp = Date.now();
          chat.messages.push({
            id: messageId,
            text: content,
            timestamp,
            author: user.id,
            keysUsed: [
              user.publicKey,
              users.get([...chat.members].find((id) => id !== user.id) ?? NaN)
                ?.publicKey ?? "",
            ],
          });

          const otherUser = [...chat.members].find((id) => id !== user.id)!;
          if (otherUser && userSockets.has(otherUser)) {
            userSockets.get(otherUser)?.send(
              JSON.stringify({
                type: "newMessage",
                chat: chatId,
                data: {
                  id: messageId,
                  content,
                  timestamp,
                  isMe: false,
                  key: user.publicKey,
                },
              }),
            );
          }

          return new Response(
            JSON.stringify({
              id: messageId,
              timestamp,
              content,
              isMe: true,
              key: users.get(
                [...chat.members].find((id) => id !== user.id) ?? NaN,
              )
                ?.publicKey ?? "",
            }),
            corsHeaders(req),
          );
        }
      }
    }

    if (keyMatch) {
      const chatId = keyMatch[1];
      const chat = getChatById(chatId);
      if (!chat || !chat.members.has(user.id)) {
        return new Response("Not found", { status: 404, ...corsHeaders(req) });
      }
      const otherUserId = [...chat.members].find((id) => id !== user.id);
      if (!otherUserId) {
        return new Response("Not found", { status: 404, ...corsHeaders(req) });
      }
      return new Response(
        users.get(otherUserId)?.publicKey ?? "Not found",
        corsHeaders(req),
      );
    }

    if (url.pathname === "/chats") {
      switch (req.method) {
        case "GET": {
          const chatsResponse = user.chats.reduce(
            (
              acc: Record<
                string,
                {
                  id: string;
                  messages: {
                    id: string;
                    content: string;
                    timestamp: number;
                    isMe: boolean;
                    key: string;
                  }[];
                  name: string;
                }
              >,
              chatId,
            ) => {
              const chat = getChatById(chatId);
              if (!chat) return acc;
              const otherUserId = [...chat.members].find((id) =>
                id !== user.id
              );
              const otherUser = users.get(otherUserId ?? NaN);
              if (!otherUser) return acc;

              acc[chat.id] = {
                id: chat.id,
                messages: chat.messages.filter((m) =>
                  m.keysUsed.includes(user.publicKey)
                ).map((message) => ({
                  id: message.id,
                  content: message.text,
                  timestamp: message.timestamp,
                  isMe: message.author === user.id,
                  key: message.keysUsed.find((k) => k !== user.publicKey) ?? "",
                })),
                name: otherUser.name,
              };
              return acc;
            },
            {},
          );

          return new Response(JSON.stringify(chatsResponse), corsHeaders(req));
        }
        case "POST": {
          const chatId = crypto.randomUUID();
          const otherUserName = await req.text();
          const otherUser = [...users.values()].find((u) =>
            u.name.toLowerCase() === otherUserName.toLowerCase()
          );

          if (!otherUser || otherUser.id === user.id) {
            return new Response("Not found", {
              status: 404,
              ...corsHeaders(req),
            });
          }

          if (
            chats.values().find((c) =>
              c.members.has(otherUser.id) && c.members.has(user.id)
            )
          ) {
            return new Response("Exists", { status: 409, ...corsHeaders(req) });
          }

          const chat: Chat = {
            id: chatId,
            messages: [],
            members: new Set([user.id, otherUser.id]),
          };
          chats.set(chatId, chat);
          user.chats.push(chatId);
          otherUser.chats.push(chatId);

          if (userSockets.has(otherUser.id)) {
            userSockets.get(otherUser.id)?.send(
              JSON.stringify({
                type: "newChat",
                chat: chatId,
                data: {
                  id: chatId,
                  name: user.name,
                  messages: [],
                },
              }),
            );
          }

          return new Response(
            JSON.stringify({
              id: chatId,
              name: otherUser.name,
              messages: [],
            }),
            corsHeaders(req),
          );
        }
      }
    }

    if (url.pathname === "/ws") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.addEventListener("open", () => {
        userSockets.set(user.id, socket);
      });
      socket.addEventListener("close", () => {
        userSockets.delete(user.id);
      });

      return response;
    }

    return new Response("Not found", { status: 404, ...corsHeaders(req) });
  },
);
