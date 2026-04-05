import { world, system } from "@minecraft/server";

const lastChat = new Map();

// --- HELPERS ---
function findTarget(name) {
    return world.getAllPlayers().find(p => p.name.toLowerCase().includes(name.toLowerCase()));
}

function getSettings() {
    let settings = world.getDynamicProperty("settings");
    return settings ? JSON.parse(settings) : { spam: true, joinMsg: true, autoBan: true };
}

// --- JOIN MESSAGE ---
world.afterEvents.playerSpawn.subscribe((ev) => {
    const { player, initialSpawn } = ev;
    if (!initialSpawn) return;

    if (getSettings().joinMsg) {
        world.sendMessage(`§7[§a+§7] §f${player.name} §7has joined!`);
    }

    // Check for Temp Bans on Join
    const banTime = world.getDynamicProperty(`ban_${player.name}`);
    if (banTime && Date.now() < banTime) {
        const remaining = Math.ceil((banTime - Date.now()) / 60000);
        system.run(() => player.runCommand(`kick "${player.name}" §cTemporarily Banned. Remaining: ${remaining} mins`));
    }
});

world.beforeEvents.chatSend.subscribe((ev) => {
    const player = ev.sender;
    const msg = ev.message;
    const settings = getSettings();

    // 1. SHADOW MUTE & MUTE CHECK
    if (player.getDynamicProperty("shadowMute")) {
        ev.cancel = true;
        system.run(() => player.sendMessage(`§f${player.name}: ${msg}`)); // Only they see it
        return;
    }
    if (player.getDynamicProperty("isMuted")) {
        ev.cancel = true;
        system.run(() => player.sendMessage("§cYou are muted."));
        return;
    }

    // 2. SPAM PROTECTION
    if (settings.spam && lastChat.has(player.id) && Date.now() - lastChat.get(player.id) < 1500) {
        ev.cancel = true;
        system.run(() => player.sendMessage("§cSlow down!"));
        return;
    }
    lastChat.set(player.id, Date.now());

    // 3. COMMANDS
    if (msg.startsWith(".")) {
        ev.cancel = true;
        system.run(() => handleCommand(player, msg.slice(1).split(" ")));
        return;
    }

    // 4. CHAT FORMATTING
    ev.cancel = true;
    let prefix = player.hasTag("rank:admin") ? "§4[Admin]§r " : (player.hasTag("rank:mod") ? "§b[Mod]§r " : "§7[Member]§r ");
    let nameColor = player.hasTag("on_duty") ? "§a" : "§f";
    system.run(() => world.sendMessage(`${prefix}${nameColor}${player.name}§r: ${msg}`));
});

function handleCommand(player, args) {
    const cmd = args[0].toLowerCase();
    const isAdmin = player.hasTag("rank:admin");
    const isStaff = isAdmin || player.hasTag("rank:mod");
    const onDuty = player.hasTag("on_duty");

    if (cmd === "duty" && isStaff) {
        if (onDuty) {
            player.removeTag("on_duty");
            player.nameTag = player.name;
            player.sendMessage("§cDuty Off.");
        } else {
            player.addTag("on_duty");
            player.nameTag = `§a${player.name}`;
            player.sendMessage("§aDuty On!");
        }
        return;
    }

    if (!onDuty && isStaff) return player.sendMessage("§cGo .duty first!");

    switch (cmd) {
        case "settings":
            if (!isAdmin) return;
            let s = getSettings();
            if (args[1] === "spam") s.spam = !s.spam;
            if (args[1] === "join") s.joinMsg = !s.joinMsg;
            world.setDynamicProperty("settings", JSON.stringify(s));
            player.sendMessage(`§eSettings Updated: ${JSON.stringify(s)}`);
            break;

        case "invsee":
            const invTarget = findTarget(args[1] || "");
            if (!invTarget) return player.sendMessage("§cNot found.");
            const inv = invTarget.getComponent("inventory").container;
            player.sendMessage(`§e--- ${invTarget.name}'s Inventory ---`);
            for (let i = 0; i < inv.size; i++) {
                const item = inv.getItem(i);
                if (item) {
                    let itemName = item.nameTag || item.typeId.replace("minecraft:", "");
                    player.sendMessage(`§7- §f${item.amount}x ${itemName} (§6${item.typeId}§f)`);
                }
            }
            break;

        case "punish":
            const target = findTarget(args[1] || "");
            const type = args[2]; // warn, kick, ban, mute, shadowmute, tempban
            if (!target) return player.sendMessage("§cPlayer not found.");

            if (type === "warn") {
                let warns = (target.getDynamicProperty("warns") || 0) + 1;
                target.setDynamicProperty("warns", warns);
                world.sendMessage(`§e[Staff] §f${target.name} warned (${warns}/8).`);
                if (warns >= 8 && getSettings().autoBan) {
                    world.setDynamicProperty(`ban_${target.name}`, Date.now() + 31536000000); // 1 year
                    player.runCommand(`kick "${target.name}" §c8/8 Warnings reached.`);
                }
            } else if (type === "shadowmute") {
                target.setDynamicProperty("shadowMute", true);
                player.sendMessage(`§7${target.name} shadow-muted.`);
            } else if (type === "tempban") {
                const mins = parseInt(args[3]) || 60;
                world.setDynamicProperty(`ban_${target.name}`, Date.now() + (mins * 60000));
                player.runCommand(`kick "${target.name}" §cTemp-banned for ${mins}m.`);
            }
            break;

        case "pardon":
            const pTarget = findTarget(args[1] || "");
            if (!pTarget) {
                // Pardon offline player by name
                world.setDynamicProperty(`ban_${args[1]}`, 0);
                return player.sendMessage(`§aPardoned ${args[1]}`);
            }
            pTarget.setDynamicProperty("warns", 0);
            pTarget.setDynamicProperty("isMuted", false);
            pTarget.setDynamicProperty("shadowMute", false);
            player.sendMessage("§aPlayer pardoned.");
            break;
            
        case "gm":
            if (!isAdmin) return;
            const modes = ["survival", "creative", "adventure", "spectator"];
            player.runCommand(`gamemode ${modes[args[1]] || "survival"}`);
            break;
    }
}
