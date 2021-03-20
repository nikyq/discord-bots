import discord
import core

import tictactoe
import indian_poker
import message_transfer

client = discord.Client(intents = discord.Intents().all())

async def bundes_on_message(pid, client, message):
    if message.author == client.user:
        return

    if isinstance(message.channel, discord.DMChannel):
        print(f"Got message \"{message.content}\" from user {message.author.name}#{message.author.discriminator} in the DM channel with the user {message.channel.recipient.name}#{message.channel.recipient.discriminator} ({str(message.channel.id)})")
    else:
        print(f"Got message \"{message.content}\" from user {message.author.name}#{message.author.discriminator} in the channel #{message.channel.name} ({str(message.channel.id)})")

    if message.content.startswith("bundes"):
        params = message.content.split(" ")[1:]

        if len(params) > 0 and params[0] == "indian":
            if len(params) > 1 and params[1] == "start":
                core.start_process(indian_poker.program)
            else:
                if not core.is_process_running(indian_poker.program):
                    await message.channel.send("Process 'indian poker' hasn't been started")
                    await message.channel.send("pssst... *bundes indian start* <-- use this")

bundes_program = core.Program(
    puid = "bundes",
    on_message = bundes_on_message
)

@client.event
async def on_ready():
    await core.start_process(bundes_program)
    await core.start_process(message_transfer.program)
    core.init(client)
    print('We have logged in as {0.user}'.format(client))































client.run('ODE2MTg4NTA2MzcyMTc3OTgy.YD3Uxw.ppjwIuPVSfwLFDf16K8njY_Dh7I')
