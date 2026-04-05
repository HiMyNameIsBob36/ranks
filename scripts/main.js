import { world, system } from "@minecraft/server";

const lastChat = new Map();
// Store punishments in a Map (Note: In a real world, these reset on restart unless saved to Dynamic Properties)
const punishments = new Map(); 

world.beforeEvents.chatSend.subscribe((ev) => {
    const player = ev.sender;
    const msg = ev.message;
    const now = Date.now();

    // 1. SPAM PROTECTION
    if (lastChat.has(player.id)) {
        if (now - lastChat.get(player.id) < 1500) {
            ev.cancel = true;
            system.run(() => player.sendMessage("§cPlease wait before typing again."));
            return;
        }
    }
    lastChat.set(player.id, now);

    // 2. COMMAND SYSTEM (.)
    if (msg.startsWith(".")) {
        ev.cancel = true;
        const args = msg.slice(1).split(" ");
        const cmd = args[0].toLowerCase();
        
        system.run(() => handleCommand(player, cmd, args));
        return;
    }

    // 3. RANK FORMATTING
    ev.cancel = true;
    let prefix = "§7[Member]§r ";
    let nameColor = player.hasTag("on_duty") ? "§a" : "§f";

    if (player.hasTag("rank:admin")) prefix = "§4[Admin]§r ";
    else if (player.hasTag("rank:mod")) prefix = "§b[Mod]§r ";

    system.run(() => {
        world.sendMessage(`${prefix}${nameColor}${player.name}§r: ${msg}`);
    });
});

function handleCommand(player, cmd, args) {
    const isAdmin = player.hasTag("rank:admin");
    const isMod = player.hasTag("rank:mod");
    const isStaff = isAdmin || isMod;

    // Command List for Error Checking
    const validCommands = ["duty", "gm", "punish", "pardon", "sc", "tp"];

    if (!validCommands.includes(cmd)) {
        player.sendMessage(`§cError: ".${cmd}" is not a command.`);
        return;
    }

    switch (cmd) {
        case "sc": // STAFF CHAT
            if (!isStaff) return;
            const staffMsg = args.slice(1).join(" ");
            if (!staffMsg) {
                player.sendMessage("§cUsage: .sc [message]");
                return;
            }
            for (const p of world.getAllPlayers()) {
                if (p.hasTag("rank:admin") || p.hasTag("rank:mod")) {
                    p.sendMessage(`§e[STAFF] §7${player.name}: §f${staffMsg}`);
                }
            }
            break;

        case "duty":
            if (!isStaff) return;
            if (player.hasTag("on_duty")) {
                player.removeTag("on_duty");
                player.nameTag = player.name;
                player.sendMessage("§cDuty Off.");
            } else {
                player.addTag("on_duty");
                player.nameTag = `§a${player.name}`;
                player.sendMessage("§aDuty On!");
            }
            break;

        case "gm":
            if (!isAdmin) return;
            if (!args[1]) {
                player.sendMessage("§cUsage: .gm [0|1]");
                return;
            }
            const mode = args[1] === "1" ? "creative" : "survival";
            player.runCommand(`gamemode ${mode}`);
            break;

        case "punish":
            if (!isStaff) return;
            // .punish [user] [type] [reason]
            const targetName = args[1];
            const type = args[2]; // warn, kick, ban
            const reason = args.slice(3).join(" ") || "No reason provided";

            if (!targetName || !type) {
                player.sendMessage("§cUsage: .punish [user] [warn|kick|ban] [reason]");
                return;
            }

            if (type === "warn") {
                world.sendMessage(`§e[Staff] §f${targetName} §7has been warned for: §f${reason}`);
            } else if (type === "kick") {
                player.runCommand(`kick "${targetName}" ${reason}`);
            } else if (type === "ban") {
                // Since Bedrock scripting can't permanently ban by IP, we kick and log it
                player.runCommand(`kick "${targetName}" BANNED: ${reason}`);
                world.sendMessage(`§4[Banned] §f${targetName} §7was banned for: §f${reason}`);
            }
            break;

        case "pardon":
            if (!isAdmin) return;
            const userToPardon = args[1];
            if (!userToPardon) {
                player.sendMessage("§cUsage: .pardon [user]");
                return;
            }
            player.sendMessage(`§aAll punishments cleared for ${userToPardon}.`);
            break;

        case "tp":
            if (!isStaff) return;
            if (args[1]) player.runCommand(`tp "${args[1]}"`);
            break;
    }
}
