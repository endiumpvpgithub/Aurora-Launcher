import net from "node:net";

export type ServerStatus = {
  online: boolean;
  motd?: string;
  version?: string;
  protocol?: number;
  players?: { online: number; max: number };
  latencyMs?: number;
  error?: string;
};

function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let val = value >>> 0;
  while (true) {
    if ((val & 0xffffff80) === 0) {
      bytes.push(val);
      break;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset: number): { value: number; offset: number } {
  let numRead = 0;
  let result = 0;
  let byte = 0;
  do {
    byte = buffer[offset++];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error("VarInt trop long");
  } while ((byte & 0x80) !== 0);
  return { value: result, offset };
}

function writeString(str: string): Buffer {
  const data = Buffer.from(str, "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}

/**
 * Ping “status” (Server List Ping) : renvoie online + joueurs + motd.
 * Pour de très vieux serveurs (<= 1.6), un fallback legacy pourra être ajouté.
 */
export async function pingMinecraftServer(
  host: string,
  port = 25565,
  timeoutMs = 2500
): Promise<ServerStatus> {
  const start = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const done = (status: ServerStatus) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(status);
    };

    socket.on("error", (err) => done({ online: false, error: String(err) }));
    socket.on("timeout", () => done({ online: false, error: "timeout" }));

    socket.connect(port, host, () => {
      // Handshake packet (0x00)
      const protocolVersion = 47; // 1.8 ; suffisant pour status.
      const serverAddr = writeString(host);
      const serverPort = Buffer.alloc(2);
      serverPort.writeUInt16BE(port, 0);
      const nextState = writeVarInt(1); // status

      const handshakeData = Buffer.concat([
        writeVarInt(0x00),
        writeVarInt(protocolVersion),
        serverAddr,
        serverPort,
        nextState
      ]);
      const handshakePacket = Buffer.concat([writeVarInt(handshakeData.length), handshakeData]);

      // Status request packet (0x00)
      const requestData = Buffer.from([0x00]);
      const requestPacket = Buffer.concat([writeVarInt(requestData.length), requestData]);

      socket.write(Buffer.concat([handshakePacket, requestPacket]));
    });

    const chunks: Buffer[] = [];
    socket.on("data", (data) => {
      chunks.push(data);
      const buffer = Buffer.concat(chunks);

      try {
        let offset = 0;
        const packetLength = readVarInt(buffer, offset);
        offset = packetLength.offset;
        if (buffer.length < offset + packetLength.value) return;

        const packetId = readVarInt(buffer, offset);
        offset = packetId.offset;
        if (packetId.value !== 0x00) return done({ online: false, error: `packetId=${packetId.value}` });

        const jsonLength = readVarInt(buffer, offset);
        offset = jsonLength.offset;
        const jsonStr = buffer.subarray(offset, offset + jsonLength.value).toString("utf8");
        const parsed = JSON.parse(jsonStr) as any;

        const latencyMs = Date.now() - start;
        const motd =
          typeof parsed?.description === "string"
            ? parsed.description
            : parsed?.description?.text ??
              parsed?.description?.extra?.map((e: any) => e?.text).join("") ??
              undefined;

        done({
          online: true,
          motd,
          version: parsed?.version?.name,
          protocol: parsed?.version?.protocol,
          players: parsed?.players ? { online: parsed.players.online, max: parsed.players.max } : undefined,
          latencyMs
        });
      } catch (err) {
        done({ online: false, error: String(err) });
      }
    });
  });
}

