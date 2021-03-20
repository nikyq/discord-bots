import core

program = core.Program(
    puid = "asdf"
    on_message = on_message
    on_reaction = on_reaction
)

async def on_message(pid, message, client):
    if core.in_memory(pid, "test1"):
        test1 = core.read_memory(pid, "test1")

    core.write_global_memory()
    core.load_saved()
        
    pass
