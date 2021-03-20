from dataclasses import dataclass
from typing import List, Any 
import itertools
from operator import attrgetter
import discord

# Forgive me for this horrible sin.
# I know I should use Callable instead of Any, but I'm too lazy to consider every parameters of each event listener.
@dataclass(frozen = True)
class Program:
    puid: str

    on_process_start: Any = None
    on_process_end: Any = None

    on_typing: Any = None
    on_message: Any = None
    on_message_delete: Any = None
    on_message_edit: Any = None
    on_reaction_add: Any = None
    on_reaction_remove: Any = None
    on_reaction_clear: Any = None
    on_reaction_clear_emoji: Any = None
    on_member_join: Any = None
    on_member_remove: Any = None
    on_member_update: Any = None
    on_user_update: Any = None
    on_member_ban: Any = None
    on_member_unban: Any = None
    on_invite_create: Any = None

@dataclass(frozen = True)
class Process:
    pid: int
    program: Program

processes: List[Process] = []

global_memory = {}
memory = {}

pid_generator = itertools.count(start = 0, step = 1)

async def start_process(program, *args, **kwargs):
    pid = next(pid_generator)
    processes.append( Process(pid = pid, program = program) )
    memory[pid] = {}

    if program.on_process_start:
        await program.on_process_start(pid, *args, **kwargs)

async def end_process(pid, *args, **kwargs):
    to_unload = [ proc for proc in processes if proc.pid == pid ]
    for proc in to_unload:
        if proc.program.on_process_end:
            process_return_value = await proc.program.on_process_end(pid, *args, **kwargs)
        processes.remove(proc)

    del memory[pid]
    return process_return_value

def is_process_running(puid):
    return ( puid in ( proc.program.puid for proc in processes ) )

def get_running_processes(puid):
    return [ proc.pid for proc in processes if proc.program.puid == puid ]

def write_memory(pid, key, data):
    proc_memory = memory[pid]
    proc_memory[key] = data

def read_memory(pid, key):
    proc_memory = memory[pid]
    if key in proc_memory:
        return proc_memory[key]
    else:
        return None

def write_global_memory(puid, key, data):
    if puid not in global_memory:
        global_memory[puid] = {}

    prog_memory = global_memory[puid]
    prog_memory[key] = data

def read_global_memory(puid, key):
    if puid not in global_memory:
        return None

    prog_memory = global_memory[puid]

    if key not in prog_memory:
        return None

    return prog_memory[key]

def delete_global_memory(puid, key):
    if puid not in global_memory:
        raise Exception(f"Failed to delete key '{key}' from the global memory: puid not in global memory (puid: {puid})")

    prog_memory = global_memory[puid]

    if key not in prog_memory:
        raise Exception(f"Failed to delete key '{key}' from the global memory: key not in global memory (puid: {puid})")

    del prog_memory[key]

# This might later result in an overhead, but we don't need to worry about that for now.
def write_permanent_memory(location, key, data):
    import pickle
    from pathlib import Path

    Path("./data").mkdir(exist_ok = True)
    data_dir = Path("./data")

    if '/' in location:
        raise Exception(f"Failed to access the permanent memory: location {location} contains the character '/'")

    memory = {}

    target = data_dir / location
    if target.is_file():
        with target.open("rb") as f:
            memory = pickle.load(f)

    if not memory:
        memory = {}

    memory[key] = data

    with target.open("wb") as f:
        pickle.dump(memory, f)

def read_permanent_memory(location, key):
    import pickle
    from pathlib import Path

    Path("./data").mkdir(exist_ok = True)
    data_dir = Path("./data")

    if '/' in location:
        raise Exception(f"Failed to access the permanent memory: location {location} contains the character '/'")

    target = data_dir / location
    if not target.is_file():
        return None

    memory = {}

    with target.open("rb") as f:
        memory = pickle.load(f)
           
        if not memory or key not in memory:
            return None

        return memory[key]

def _get_entire_permanent_memory(location): # only for debugging purposes!!
    import pickle
    from pathlib import Path

    Path("./data").mkdir(exist_ok = True)
    data_dir = Path("./data")

    if '/' in location:
        raise Exception(f"Failed to access the permanent memory: location {location} contains the character '/'")

    target = data_dir / location
    if not target.is_file():
        return None

    memory = {}
    with target.open("rb") as f:
        memory = pickle.load(f)
        return memory

def delete_permanent_memory(location, key):
    import pickle
    from pathlib import Path

    Path("./data").mkdir(exist_ok = True)
    data_dir = Path("./data")

    if '/' in location:
        raise Exception(f"Failed to access the permanent memory: location {location} contains the character '/'")

    target = data_dir / location
    if not target.is_file():
        raise Exception(f"Failed to delete from the permanent memory: location {location} does not exist.")

    memory = {}
    with target.open("rb") as f:
        memory = pickle.load(f)

    if memory == None:
        raise Exception(f"Failed to delete from the permanent memory: memory in location {location} is somehow None")
        
    if key not in memory:
        raise Exception(f"Failed to delete from the permanent memory: key {key} in location {location} does not exist.")
    
    del memory[key]

    with target.open("wb") as f:
        pickle.dump(memory, f)

async def on_event(method_getter, client, *args, **kwargs):
    for process in list(processes):
        if process in processes: # if it's not terminated
            listener = method_getter(process.program)
            if listener:
                await listener(process.pid, client, *args, **kwargs)

def handler(name, client):
    async def on_general(*args, **kwargs):
        await on_event(attrgetter(name), client, *args, **kwargs)
    on_general.__name__ = name # yeah, why is this even possible lmao
    return on_general

def init(client):
    client.event(handler("on_message", client))
    client.event(handler("on_typing", client))
    client.event(handler("on_message_delete", client))
    client.event(handler("on_message_edit", client))
    client.event(handler("on_reaction_add", client))
    client.event(handler("on_reaction_remove", client))
    client.event(handler("on_reaction_clear", client))
    client.event(handler("on_reaction_clear_emoji", client))
    client.event(handler("on_member_join", client))
    client.event(handler("on_member_remove", client))
    client.event(handler("on_member_update", client))
    client.event(handler("on_user_update", client))
    client.event(handler("on_member_ban", client))
    client.event(handler("on_member_unban", client))
    client.event(handler("on_invite_create", client))
