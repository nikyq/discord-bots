import core
import discord

from dataclasses import dataclass

puid = "optin"

MAX_SAVED_MESSAGES = 500

@dataclass(frozen = True)
class Message:
    source_message: discord.Message
    delivered_message: discord.Message

async def on_process_start(pid, user, channel):
    core.write_memory(pid, "user", user)
    core.write_memory(pid, "channel", channel)

    users = core.read_global_memory(puid, "users")
    if not users:
        users = []

    for u, p in users:
        if u == user:
            await core.end_process(p)
            users.remove((u, p))

    users.append((user, pid))
    core.write_global_memory(puid, "users", users)

    await user.send("Successfully opted in!")

async def on_process_end(pid):
    users = core.read_global_memory(puid, "users")
    if not users:
        users = []

    for u, p in users:
        if p == pid:
            users.remove((u, p))

    core.write_global_memory(puid, "users", users)

def create_message_embed(message):
    embed = discord.Embed(description = message.content)
    embed.set_author(name = f"{message.author.name}#{message.author.discriminator}", icon_url = message.author.avatar_url)
    if message.edited_at:
        embed.set_footer(text = f"edited at {message.edited_at.strftime('%m-%d-%Y, %H:%M:%S')}")
    else:
        embed.set_footer(text = f"sent at {message.created_at.strftime('%m-%d-%Y, %H:%M:%S')}")
        
    return embed

def create_deleted_message_embed(message):
    from datetime import datetime
    embed = discord.Embed(description = "~~" + message.content + "~~")
    embed.set_author(name = f"{message.author.name}#{message.author.discriminator}", icon_url = message.author.avatar_url)
    embed.set_footer(text = "========DELETED========" + "\n" + f"deleted at {datetime.now().strftime('%m-%d-%Y, %H:%M:%S')}")
    return embed

def read_messages(pid):
    messages = core.read_memory(pid, "messages")
    if not messages:
        messages = []
    return messages

async def find_message_original_reference(message, client):
    if not message.reference:
        return None

    msg_id = message.reference.message_id
    channel_id = message.reference.channel_id

    channel = client.get_channel(channel_id)
    if not channel:
        return None

    try:
        found_message = await channel.fetch_message(msg_id)
    except Exception: # NotFound / Forbidden / HTTPException
        return None

    return found_message

def find_message_corresponding_reference(message, messages):
    corresponding_src = [ m for m in messages if m.source_message == message ]
    corresponding_tgt = [ m for m in messages if m.delivered_message == message ]

    if len(corresponding_src) > 0:
        return corresponding_src[0].delivered_message
    elif len(corresponding_tgt) > 0:
        return corresponding_tgt[0].source_message
    else:
        return None

async def on_message(pid, client, message):
    import message_transfer
    opted_user = core.read_memory(pid, "user")
    target_channel = core.read_memory(pid, "channel")

    messages = read_messages(pid)

    if message.author == opted_user and isinstance(message.channel, discord.DMChannel):
        if message.content.strip() == "bundes transfer opt-out":
            await message.channel.send("Opting out...")
            await core.end_process(pid)
            return

        files = None
        if len(message.attachments) > 0:
            files = [ await f.to_file() for f in message.attachments ]

        reference = find_message_corresponding_reference(await find_message_original_reference(message, client), messages)
        sent_message = await target_channel.send(content = message_transfer.process_message(message.content, target_channel, client),
                                                 files = files,
                                                 reference = reference)

    elif message.channel == target_channel and message.author != client.user:
        files = None
        if len(message.attachments) > 0:
            files = [ await f.to_file() for f in message.attachments ]

        reference = find_message_corresponding_reference(await find_message_original_reference(message, client), messages)
        sent_message = await opted_user.send(files = files, embed = create_message_embed(message), reference = reference)

    else:
        return
    
    messages = [ *messages[ max(0, len(messages) - MAX_SAVED_MESSAGES + 1) : ],
                 Message(source_message = message, delivered_message = sent_message) ] 

    core.write_memory(pid, "messages", messages)

async def on_message_edit(pid, client, before, after):
    import message_transfer

    opted_user = core.read_memory(pid, "user")
    target_channel = core.read_memory(pid, "channel")

    messages = read_messages(pid)

    if before.author == opted_user and isinstance(before.channel, discord.DMChannel): # opted user edited their own message
        corresponding_messages = [ message for message in messages if message.source_message == before ]
        for m in corresponding_messages:
            await m.delivered_message.edit(content = message_transfer.process_message(after.content, target_channel, client))

    elif before.channel == target_channel and before.author != client.user: # a message was edited in the opted channel
        corresponding_messages = [ message for message in messages if message.source_message == before ]
        for m in corresponding_messages:
            await m.delivered_message.edit(embed = create_message_embed(after))
    else:
        return

    core.write_memory(pid, "messages", messages)

async def on_message_delete(pid, client, message):
    import message_transfer
    import copy

    opted_user = core.read_memory(pid, "user")
    target_channel = core.read_memory(pid, "channel")

    messages = read_messages(pid)

    if message.author == opted_user and isinstance(message.channel, discord.DMChannel):
        corresponding_messages = [ m for m in messages if m.source_message == message ]
        for m in corresponding_messages:
            await m.delivered_message.delete()
    elif message.channel == target_channel and message.author != client.user:
        corresponding_messages = [ m for m in messages if m.source_message == message ]
        for m in corresponding_messages:
            embed = create_deleted_message_embed(message)
            await m.delivered_message.edit(embed = embed)
    else:
        return

    for c_message in corresponding_messages:
        messages.remove(c_message)

    core.write_memory(pid, "messages", messages)

async def on_reaction_add(pid, client, reaction, user):
    opted_user = core.read_memory(pid, "user")
    target_channel = core.read_memory(pid, "channel")
    messages = read_messages(pid)

    message = reaction.message
    if user == opted_user and isinstance(message.channel, discord.DMChannel) \
    or message.channel == target_channel and user != client.user:
        corresponding_source_messages = [ m for m in messages if m.source_message == message ]
        corresponding_delivered_messages = [ m for m in messages if m.delivered_message == message ]

        for m in corresponding_source_messages:
            await m.delivered_message.add_reaction(reaction)

        for m in corresponding_delivered_messages:
            await m.source_message.add_reaction(reaction)

async def on_reaction_remove(pid, client, reaction, user):
    opted_user = core.read_memory(pid, "user")
    target_channel = core.read_memory(pid, "channel")
    messages = read_messages(pid)

    message = reaction.message
    if user == opted_user and isinstance(message.channel, discord.DMChannel) \
    or message.channel == target_channel and user != client.user:
        corresponding_source_messages = [ m for m in messages if m.source_message == message ]
        corresponding_delivered_messages = [ m for m in messages if m.delivered_message == message ]

        for m in corresponding_source_messages:
            await m.delivered_message.remove_reaction(reaction, client.user)

        for m in corresponding_delivered_messages:
            await m.source_message.remove_reaction(reaction, client.user)

async def on_reaction_clear(pid, client, message, reactions):
    pass

async def on_reaction_clear_emoji(pid, client, reaction):
    pass

program = core.Program(
    puid = puid,
    on_process_start = on_process_start,
    on_process_end = on_process_end,
    on_message = on_message,
    on_message_edit = on_message_edit,
    on_message_delete = on_message_delete,
    on_reaction_add = on_reaction_add,
    on_reaction_remove = on_reaction_remove
    # on_reaction_clear = on_reaction_clear,
    # on_reaction_clear_emoji = on_reaction_clear_emoji
)
