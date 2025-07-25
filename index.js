// index.js
const { Client, IntentsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// إعداد البوت
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions
    ]
});

// ملفات البيانات
const dataDir = './data';
const giveawaysFile = path.join(dataDir, 'giveaways.json');

// إنشاء مجلد البيانات إذا لم يكن موجود
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// تحميل البيانات
let giveaways = {};

try {
    if (fs.existsSync(giveawaysFile)) {
        giveaways = JSON.parse(fs.readFileSync(giveawaysFile, 'utf8'));
    }
} catch (error) {
    console.error('Error loading data:', error);
}

// حفظ البيانات
function saveData() {
    try {
        fs.writeFileSync(giveawaysFile, JSON.stringify(giveaways, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// تحويل الوقت من نص إلى ميلي ثانية
function parseTime(timeString) {
    const regex = /(\d+)([smhd])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(timeString)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': totalMs += value * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
        }
    }

    return totalMs;
}

// تنسيق الوقت المتبقي
function formatTimeLeft(ms) {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms % (60 * 1000)) / 1000);

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (seconds > 0) result += `${seconds}s`;

    return result || '0s';
}

// اختيار فائزين عشوائيين
function selectWinners(participants, count) {
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, participants.length));
}

// إنهاء القيفاوي
async function endGiveaway(giveawayId) {
    const giveaway = giveaways[giveawayId];
    if (!giveaway) return;

    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(giveaway.messageId);
        
        let winners = [];
        if (giveaway.participants.length >= giveaway.winners) {
            winners = selectWinners(giveaway.participants, giveaway.winners);
        }

        // إيمبد القيفاوي المنتهي بالتصميم الجديد
        const embed = new EmbedBuilder()
            .setColor('#FF0000') // أحمر
            .setTimestamp();

        if (winners.length > 0) {
            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
            embed.setTitle(`🎉 ${giveaway.prize} 🎉`)
                .setDescription(`🔔 Winner(s): ${winnerMentions}
⚙️ Ending: Ended
↕️ Hosted by: <@${giveaway.hostId}>`)
                .setFooter({ 
                    text: `${giveaway.winners} > 🏆 winner(s) • Ended at | <t:${Math.floor(Date.now() / 1000)}:F> | 🎉 ${giveaway.participants.length}`
                });
            
            // رسالة منفصلة للفائزين
            await channel.send(`🎊 Congratulations ${winnerMentions}! You won **${giveaway.prize}**! 🎉`);
        } else {
            embed.setTitle(`🎉 ${giveaway.prize} 🎉`)
                .setDescription(`🔔 Winner(s): No valid entries
⚙️ Ending: Ended  
↕️ Hosted by: <@${giveaway.hostId}>`)
                .setFooter({ 
                    text: `${giveaway.winners} > 🏆 winner(s) • Ended at | <t:${Math.floor(Date.now() / 1000)}:F> | 🎉 ${giveaway.participants.length}`
                });
        }

        await message.edit({ 
            embeds: [embed]
        });
        
        // حفظ القيفاوي المنتهي لإعادة السحب
        let endedGiveaways = [];
        try {
            if (fs.existsSync('./data/ended_giveaways.json')) {
                endedGiveaways = JSON.parse(fs.readFileSync('./data/ended_giveaways.json', 'utf8'));
            }
        } catch (error) {
            console.error('Error loading ended giveaways:', error);
        }

        endedGiveaways.push({
            ...giveaway,
            endedAt: Date.now(),
            winners: winners
        });

        // الاحتفاظ بآخر 50 قيفاوي منتهي فقط
        if (endedGiveaways.length > 50) {
            endedGiveaways = endedGiveaways.slice(-50);
        }

        fs.writeFileSync('./data/ended_giveaways.json', JSON.stringify(endedGiveaways, null, 2));
        
        delete giveaways[giveawayId];
        saveData();

    } catch (error) {
        console.error('Error ending giveaway:', error);
    }
}

// عند تشغيل البوت
client.once('ready', () => {
    console.log(`Bot is ready: ${client.user.tag}`);
    
    // فحص القيفاويات المنتهية
    setInterval(() => {
        const now = Date.now();
        for (const [giveawayId, giveaway] of Object.entries(giveaways)) {
            if (now >= giveaway.endTime) {
                endGiveaway(giveawayId);
            }
        }
    }, 5000); // فحص كل 5 ثواني
});

// معالجة الأوامر
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // أمر المساعدة
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🎉 Giveaway Bot - Commands')
            .setColor('#0099ff')
            .setDescription('All available giveaway bot commands:')
            .addFields(
                {
                    name: '🚀 `!gstart <time> <winners_count> <prize>`',
                    value: 'Start a new giveaway\nExample: `!gstart 1h 2 Discord Nitro`\nTime formats: s=seconds, m=minutes, h=hours, d=days',
                    inline: false
                },
                {
                    name: '⏹️ `!gend <message_id>`',
                    value: 'End a giveaway manually\nExample: `!gend 1234567890123456789`',
                    inline: false
                },
                {
                    name: '📋 `!glist`',
                    value: 'Show list of active giveaways in the server',
                    inline: false
                },
                {
                    name: '🔄 `!greroll <message_id>`',
                    value: 'Reroll winners for a giveaway\nExample: `!greroll 1234567890123456789`',
                    inline: false
                }
            )
            .setFooter({ 
                text: 'Made with ❤️ for the community',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        message.reply({ embeds: [helpEmbed] });
        return;
    }

    // أمر بدء قيفاوي
    if (command === 'gstart') {
        if (!message.member.permissions.has('MANAGE_GUILD')) {
            const errorMsg = await message.reply('❌ You need Manage Server permission to use this command');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            return;
        }

        if (args.length < 3) {
            const errorMsg = await message.reply('❌ Usage: `!gstart <time> <winners_count> <prize>`\nExample: `!gstart 1h 1 Discord Nitro`');
            setTimeout(() => errorMsg.delete().catch(() => {}), 10000);
            return;
        }

        const timeArg = args[0];
        const winnersCount = parseInt(args[1]);
        const prize = args.slice(2).join(' ');

        const duration = parseTime(timeArg);
        if (duration === 0) {
            const errorMsg = await message.reply('❌ Invalid time! Use examples: 1h, 30m, 1d');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            return;
        }

        if (isNaN(winnersCount) || winnersCount < 1) {
            const errorMsg = await message.reply('❌ Winners count must be a number greater than 0');
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            return;
        }

        // حذف رسالة الأمر
        message.delete().catch(() => {});

        const giveawayId = Date.now().toString();
        const endTime = Date.now() + duration;

        // إنشاء الإيمبد بالتصميم الجديد
        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${prize} 🎉`)
            .setColor('#FFFF00') // أصفر
            .setDescription(`🔔 React with 🎉 to enter !
⚙️ Ending: <t:${Math.floor(endTime / 1000)}:R>
↕️ Hosted by: <@${message.author.id}>`)
            .setFooter({ 
                text: `${winnersCount} > 🏆 winner(s) • Ended at | <t:${Math.floor(endTime / 1000)}:F> | 🎉 ${Math.floor(Math.random() * 1000)}`
            });

        const giveawayMessage = await message.channel.send({ 
            embeds: [embed] 
        });

        // إضافة ريأكشن
        await giveawayMessage.react('🎉');

        giveaways[giveawayId] = {
            messageId: giveawayMessage.id,
            channelId: message.channel.id,
            guildId: message.guild.id,
            host: message.author.username,
            hostId: message.author.id,
            prize: prize,
            winners: winnersCount,
            endTime: endTime,
            participants: []
        };

        saveData();
    }

    // أمر إنهاء قيفاوي
    else if (command === 'gend') {
        if (!message.member.permissions.has('MANAGE_GUILD')) {
            return message.reply('❌ You need Manage Server permission to use this command');
        }

        if (args.length === 0) {
            return message.reply('❌ Usage: `!gend <message_id>`');
        }

        const messageId = args[0];
        const giveawayId = Object.keys(giveaways).find(id => giveaways[id].messageId === messageId);

        if (!giveawayId) {
            return message.reply('❌ No active giveaway found with this ID');
        }

        await endGiveaway(giveawayId);
        message.reply('✅ Giveaway ended successfully!');
    }

    // أمر قائمة القيفاويات
    else if (command === 'glist') {
        const activeGiveaways = Object.values(giveaways).filter(g => g.guildId === message.guild.id);

        if (activeGiveaways.length === 0) {
            return message.reply('📋 No active giveaways currently');
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Active Giveaways List')
            .setColor('#0099ff')
            .setTimestamp();

        activeGiveaways.forEach((giveaway, index) => {
            const timeLeft = formatTimeLeft(giveaway.endTime - Date.now());
            embed.addFields({
                name: `${index + 1}. ${giveaway.prize}`,
                value: `**Winners:** ${giveaway.winners}\n**Time Left:** ${timeLeft}\n**ID:** ${giveaway.messageId}`,
                inline: false
            });
        });

        message.reply({ embeds: [embed] });
    }

    // أمر إعادة السحب
    else if (command === 'greroll') {
        if (!message.member.permissions.has('MANAGE_GUILD')) {
            return message.reply('❌ You need Manage Server permission to use this command');
        }

        if (args.length === 0) {
            return message.reply('❌ Usage: `!greroll <message_id>`');
        }

        const messageId = args[0];
        
        // البحث في القيفاويات المنتهية حديثاً
        let endedGiveaways = [];
        try {
            if (fs.existsSync('./data/ended_giveaways.json')) {
                endedGiveaways = JSON.parse(fs.readFileSync('./data/ended_giveaways.json', 'utf8'));
            }
        } catch (error) {
            console.error('Error loading ended giveaways:', error);
        }

        const giveaway = endedGiveaways.find(g => g.messageId === messageId && g.guildId === message.guild.id);

        if (!giveaway) {
            return message.reply('❌ No ended giveaway found with this ID');
        }

        if (giveaway.participants.length === 0) {
            return message.reply('❌ No participants to reroll');
        }

        const newWinners = selectWinners(giveaway.participants, giveaway.winners);
        const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');

        message.channel.send(`🔄 Congratulations ${winnerMentions}! You are the new winners of **${giveaway.prize}**!`);
    }
});

// معالجة ريأكشن القيفاوي
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== '🎉') return;

    // البحث عن القيفاوي
    const giveawayId = Object.keys(giveaways).find(id => 
        giveaways[id].messageId === reaction.message.id
    );

    if (!giveawayId) return;

    const giveaway = giveaways[giveawayId];
    
    if (giveaway.participants.includes(user.id)) {
        return;
    }

    giveaway.participants.push(user.id);
    saveData();
});

// معالجة إزالة ريأكشن القيفاوي
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== '🎉') return;

    // البحث عن القيفاوي
    const giveawayId = Object.keys(giveaways).find(id => 
        giveaways[id].messageId === reaction.message.id
    );

    if (!giveawayId) return;

    const giveaway = giveaways[giveawayId];
    const userIndex = giveaway.participants.indexOf(user.id);
    
    if (userIndex > -1) {
        giveaway.participants.splice(userIndex, 1);
        saveData();
    }
});

// تسجيل الدخول
client.login('MTE5MTc2Mjg4MDA2OTExMTgzOA.GJ2Kgu.-Rqn0QyuKNfhB6-pERPWcKogVQo7TShPXCFn-k');
