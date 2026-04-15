import { world, system } from "@minecraft/server";

// Simple in-memory database (Note: In a real mod, you'd use dynamic properties to save this)
const teams = {}; 
const playerStates = {}; // To track team chat toggle

world.beforeEvents.chatSend.subscribe((data) => {
    const { sender, message } = data;

    // Handle Team Chat Toggle
    if (playerStates[sender.name]?.teamChat && !message.startsWith(".")) {
        data.cancel = true;
        const playerTeam = Object.values(teams).find(t => t.members.includes(sender.name));
        if (playerTeam) {
            playerTeam.members.forEach(m => {
                const p = world.getPlayers().find(pl => pl.name === m);
                p?.sendMessage(`§b[TEAM] §f${sender.name}: ${message}`);
            });
        } else {
            sender.sendMessage("§cYou aren't in a team anymore. Team chat disabled.");
            playerStates[sender.name].teamChat = false;
        }
        return;
    }

    if (!message.startsWith(".team")) return;

    data.cancel = true; // Stop message from appearing in global chat
    const args = message.split(" ");
    const command = args[1];

    system.run(() => {
        handleCommand(sender, args, command);
    });
});

function handleCommand(player, args, command) {
    switch (command) {
        case undefined:
            player.sendMessage("§l§b--- Cosmos Teams Help ---");
            player.sendMessage("§e.team list §7- View all teams");
            player.sendMessage("§e.team home §7- TP to team home");
            player.sendMessage("§e.team chat §7- Toggle team-only chat");
            player.sendMessage("§e.team leave §7- Exit your current team");
            player.sendMessage("§e.team members §7- Manage members (Manager+)");
            break;

        case "list":
            player.sendMessage("§bActive Teams:");
            for (const tName in teams) {
                player.sendMessage(`§e- ${tName} §7(${teams[tName].members.join(", ")})`);
            }
            break;

        case "chat":
            if (!playerStates[player.name]) playerStates[player.name] = {};
            playerStates[player.name].teamChat = !playerStates[player.name].teamChat;
            player.sendMessage(`§bTeam chat ${playerStates[player.name].teamChat ? "§aEnabled" : "§cDisabled"}`);
            break;

        case "home":
            const myTeam = Object.values(teams).find(t => t.members.includes(player.name));
            if (myTeam && myTeam.home) {
                player.teleport(myTeam.home);
                player.sendMessage("§aTeleported to Team Home!");
            } else {
                player.sendMessage("§cYour team has no home set.");
            }
            break;

        case "leave":
            handleLeave(player);
            break;

        default:
            player.sendMessage("§cUnknown team command. Type '.team' for help.");
            break;
    }
}

function handleLeave(player) {
    for (const tName in teams) {
        const team = teams[tName];
        if (team.owner === player.name) {
            delete teams[tName];
            player.sendMessage(`§cTeam ${tName} disbanded.`);
            return;
        }
        if (team.members.includes(player.name)) {
            team.members = team.members.filter(m => m !== player.name);
            player.sendMessage("§eYou left the team.");
            return;
        }
    }
}

// Actionbar notification on join
world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        system.runTimeout(() => {
            event.player.onScreenDisplay.setActionBar("§bNever used Cosmos Teams before? Type §e'.team'§b in chat!");
        }, 40);
    }
});
