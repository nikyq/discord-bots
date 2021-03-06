// This line MUST be first, for discord.js to read the process envs!
require('dotenv').config(); 
const Discord = require("discord.js");
const Should = require("should");
const Rx = require("rxjs");
const RxOp = require("rxjs/operators");
const R = require("ramda")
const fs = require('fs');

const client = new Discord.Client();


/*
  Action
  ADD
  REMOVE

  { "type":""
  "payload":{ "channel": "asdf"
  "user": "asdfasdf"
  "data": {} } }
*/

run()

/* function create_action(type, payload) {
   return {"type": type, "payload": payload}
   } */

let global_memory = {}

function get_memory() {
    return JSON.parse(fs.readFileSync("memory.json"));
}

function set_memory(memory) {
    fs.writeFileSync("memory.json", JSON.stringify(memory));
}

function create_context(message) {
    return {"message": message};
}

function create_locinfo(channel, user) {
    channel.should.match(/^\d+$/); // Channel id must only consist of numbers
    user.should.match(/^\d+$/); // User id too
    return {"channel": channel, "user": user}
}

function create_ward(desc, url, locinfo) {
    return {"desc": desc, "url": url, "locinfo": locinfo}
}

const query_entries_per_page = 5;

function create_asking_query(page, choices, query_action) {
    return { "state":"ASKING", "page":page, "choices":choices,
             "query_action": query_action, "message_id": "NOT SET YET" }
}

function create_canceled_query() {
    return { "state":"CANCELED", "page":0, "choices":[], "query_action": "",
             "message_id": "CANNOT EXIST"}
}

function create_search_action(query_user, query_text, locinfo) {
    return {"type": "SEARCH",
            "query_user": query_user,
            "query_text": query_text,
            "locinfo": locinfo }
}

function create_change_page_action(query_user, change_direction) {
    return {"type": "CHANGE_PAGE",
            "query_user": query_user,
            "change_direction": change_direction }
}

function create_add_action(ward) {
    return {"type": "ADD",
            "ward": ward }
}

function create_answer_action(query_user, selection) {
    return {"type": "ANSWER",
            "query_user": query_user,
            "selection": selection}
}

function create_delete_action(query_user, query_text, locinfo) {
    return {"type": "DELETE",
            "query_user": query_user,
            "query_text": query_text,
            "locinfo": locinfo }
}

function create_error_action(message) {
    return {"type": "ERROR", 
            "message": message}
}

function create_ignore_action() {
    return {"type": "IGNORE"};
}

function create_help_action() {
    return {"type": "HELP"}
}

function create_register_query_message_action(query_user, message_id) {
    return {"type": "REGISTER_QUERY_MESSAGE",
            "query_user": query_user,
            "message_id": message_id }
}

function create_query_answer(status, payload) {
    return {"status": status, // IGNORED / NO_RESULT / SUCCESS
            "payload": payload};
}

const loc_lens = locinfo => R.lensPath(["wards", locinfo.channel, locinfo.user])
const query_lens = query_user => R.lensPath(["queries", query_user])

function add_ward(ward, memory) {
    const locinfo = ward.locinfo;
    return R.over(loc_lens(locinfo), R.prepend(ward), memory); // order by recent
}

function search_ward(query_text, locinfo, memory) {
    const wards = R.view(loc_lens(locinfo), memory);
    const re = new RegExp(query_text);
    if(!Array.isArray(wards)) return [];
    return wards.filter(ward => ward.desc.match(re));
}

function delete_ward(ward, memory) {
    const locinfo = ward.locinfo;
    return R.over(loc_lens(locinfo), R.reject(R.equals(ward)), memory);
}

function print_ward(ward, context) {
    ward.should.have.properties(["desc", "url", "locinfo"]); //definitely need refactoring
    context.message.channel.send(`'${ward.desc}' 와드 좌표를 전송할게요!`);
    context.message.channel.send(ward.url);
}

function make_query_message(query, header_text) {
    let reply_msg = `${header_text}\n`;
    const num_to_emo = num =>
          [":zero:", ":one:", ":two:", ":three:", ":four:",
           ":five:", ":six:", ":seven:", ":eight:", ":nine:"][num];

    for(const [idx, ward] of query_page_choices(query).entries()) { // need to ensure non-emptiness
        reply_msg = reply_msg.concat(`> ${num_to_emo(idx+1)}  ` + ward.desc + "\n");
    }
    reply_msg = reply_msg.concat("**n**은 다음 페이지! **p**는 이전 페이지! **c**는 취소!");
    return reply_msg;
}

function print_query(query, header_text, context) {
    const reply_msg = make_query_message(query, header_text);
    return context.message.channel.send(reply_msg);
}

function edit_query_message(query, header_text, context) {
    const reply_msg = make_query_message(query, header_text);
    const message_id = query.message_id;

    context.message.channel.fetchMessage(message_id)
        .then(message => message.edit(reply_msg))
        .catch(() => console.log(`I think the message ${message_id} is already deleted...`));
}

function delete_query_message(query, context) {
    const message_id = query.message_id;

    context.message.channel.fetchMessage(message_id)
        .then(message => message.delete())
        .catch(() => console.log(`I think the message ${message_id} is already deleted...`));
}

// Gotta make 'em Either-like style
function query_inc_page(query) {
    const page = query.page
    const size = query.choices.length;

    if (page * query_entries_per_page >= size)
        return [false, query];

    const new_query = R.assoc("page", page+1, query);
    return [true, new_query];
}

function query_dec_page(query) {
    const page = query.page
    const size = query.choices.length;

    if (page <= 1)
        return [false, query];

    const new_query = R.assoc("page", page-1, query);
    return [true, new_query];
}

function query_page_choices(query) {
    return R.slice((query.page - 1) * query_entries_per_page,
                   query.page * query_entries_per_page,
                   query.choices);
}

function query_get_last_page(query) {
    return Math.floor((query.choices.length - 1) / query_entries_per_page) + 1;
}

const get_query = (query_user, memory) => R.view(query_lens(query_user), memory);
const apply_query = (query, query_user, memory) => R.set(query_lens(query_user), query, memory);

const get_command = message => message.slice(process.env.PREFIX.length).trim().split(/ +/g); // message must be string

function transfer_memory(action, memory) {
    const type = action.type;
    if (type === "ADD") {
        const ward = action.ward;
        return [ward, add_ward(ward, memory)];
    }
    else if (type === "SEARCH" || type === "DELETE") {
        const query_user = action.query_user;
        const query_text = action.query_text;
        const locinfo = action.locinfo;
        const query_page = 1; // for now

        const search_result = search_ward(query_text, locinfo, memory)
        const query_action = {
            "SEARCH": "SHOW",
            "DELETE": "DELETE" }[type]

        const query = create_asking_query(query_page, search_result, query_action);

        if(search_result.length > 0)
            return [query, apply_query(query, query_user, memory)];
        return [query, memory];
    }
    else if(type === "CHANGE_PAGE") {
        const direction = action.change_direction;
        const query_user = action.query_user;

        const query = get_query(query_user, memory);
        if(query && query.state === "ASKING") {
            if(direction === "n") {
                [success_p, new_query] = query_inc_page(query);
                if(!success_p)
                    return [ [false, "마지막 페이지라서 다음으로 못 넘어가요 ㅠㅠ"],
                            memory];

                return [ [true, new_query],
                        R.set(query_lens(query_user), new_query, memory)];
            }
            else if(direction === "p") {
                [success_p, new_query] = query_dec_page(query);
                if(!success_p)
                    return [ [false, "처음 페이지라서 이전으로 못 넘어가요 ㅠㅠ"],
                            memory];

                return [ [true, new_query],
                        R.set(query_lens(query_user), new_query, memory)];
            }
            else
                throw `Impossible!!! (direction=${direction})`;
        }
        else
            return [ [false, ""], memory];
    }
    else if(type === "ANSWER") {
        const query_user = action.query_user;
        const selection = action.selection;
        const to_real_index = (page, idx) => (page - 1) * query_entries_per_page + idx;

        const query = get_query(query_user, memory);
        const canceled_query = create_canceled_query();
        const query_canceled_memory = apply_query(canceled_query, query_user, memory);

        if(query && query.state === "ASKING") {  // need refactoring
            if(selection.match(/^\d$/)) {
                const idx = +selection - 1; // parse to int
                if(to_real_index(query.page, idx) >= query.choices.length ||
                   idx < 0) // need testing
                    return [create_query_answer("IGNORED", "그... 범위 넘어갔어여..."), memory];
                // result :: Ward
                const result = query.choices[to_real_index(query.page, idx)];

                if(query.query_action === "SHOW")
                    return [ create_query_answer("SUCCESS", { ward: result, // :: Ward
                                                              query: query }), 
                             query_canceled_memory ];
                else if(query.query_action === "DELETE")
                    return [ create_query_answer("NO_RESULT", { msg: "삭제 완료!",
                                                                query: query }),
                             delete_ward(result, query_canceled_memory) ];
                else
                    throw "Impossible!!!";
            }
            else if(selection === "c"){
                return [create_query_answer("NO_RESULT", { msg: "",
                                                           query: query }),
                        apply_query(canceled_query, query_user, memory) ];
            }
            else {
                throw "Impossible!!!";
            }
        }
        return [create_query_answer("IGNORED", ""), memory];
    }
    else if(type === "REGISTER_QUERY_MESSAGE") {
        const query_user = action.query_user;
        const message_id = action.message_id;

        const applied_query = R.assoc("message_id", message_id, get_query(query_user, memory));
        const new_memory = R.set(query_lens(query_user), applied_query, memory);
        return [null, new_memory];
    }
    else return [null, memory];
}

function output(action, result, context, dispatch) {
    const type = action.type;
    const channel = context.message.channel;

    if(type === "HELP") {
        channel.send(new Discord.RichEmbed()
                     .setTitle("사용법을 알려드릴게요!")
                     .setDescription(`
!ward set <설명> -> 와드를 박아요! 설명은 필수!
!ward search <검색어> -> 말 그대로 검색이에여 참고로 정규식 지원해여
!ward recent -> 최근에 박힌 와드 목록이 나와요!
!ward delete [검색어] -> 와드를 지워요! 검색어 생략시 최근 와드 목록!
!ward help -> 지금 보고 계시는 도움말이에여`));
    }
    else if (type === "ADD") {
        channel.send("와드 박았슴니다 ㅇㅅㅇ");
    }
    else if(type === "SEARCH" || type === "DELETE") {
        const query_user = action.query_user;
        const header = action.query_text === ".+"
              ? "최근 와드 목록입니다!"
              : `${action.query_text}에 대한 검색 결과입니다!`;
        const page_info = `(${result.page} / ${query_get_last_page(result)})`;
        if(result.choices.length <= 0)
            channel.send("검색 결과가 없어요...");
        else
            print_query(result, header+" "+page_info, context)
                .then(msg => dispatch(create_register_query_message_action(query_user, msg.id))); // dispatch
    }
    else if(type === "CHANGE_PAGE") {
        const header = "페이지를 바꿨어요!";

        const [success_p, data] = result; // data :: ErrMsg or Query
        if(!success_p)
        {
            if(data) {
                channel.send(data);
                context.message.delete();
            }
        }
        else {
            const page_info = `(${data.page} / ${query_get_last_page(data)})`;
            edit_query_message(data, header+" "+page_info, context);
            context.message.delete();
        }
    }
    else if(type === "ANSWER") {
        const status = result.status;

        if(status === "IGNORED")
        {
            if(result.payload)
                channel.send(result.payload);
        }
        else{
            if(status === "NO_RESULT")
            {
                const query = result.payload.query;
                delete_query_message(query, context);
                if(result.payload.msg)
                    channel.send(result.payload.msg);
            }
            else if(status === "SUCCESS")
            {
                const query = result.payload.query;
                delete_query_message(query, context);

                print_ward(result.payload.ward, context);
            }
            else
                throw "IMPOSSIBLE!!!!";

            context.message.delete();
        }
    }
    else if(type === "ERROR") {
        channel.send(action.message);
    }
    /* else
        console.log(`${type} 그건 몰라염ㅇㅅㅇ`); */
}

function parse_message(message) {
    if(message.content.indexOf(process.env.PREFIX) !== 0)
    {
        if(message.content.match(/^[\dc]$/)) // if is answer to the query
            return create_answer_action(message.author.id, message.content);
        if(message.content.match(/^[np]/)) // if is request for another query
            return create_change_page_action(message.author.id, message.content);
        return create_ignore_action();
    }
    const [command, ...args] = get_command(message.content);
    if (command === "set") {
        if (args.length <= 0) {
            return create_error_action("와드 설명이 없으면 어떡해여 ㅠㅠㅠ");
        }
        const desc = args.join(" ");
        const locinfo = create_locinfo(message.channel.id, message.author.id);
        const ward = create_ward(desc, message.url, locinfo);

        // need refactoring since parse_message does too many things
        return create_add_action(ward); 
    }
    else if (command === "search") {
        if (args.length <= 0) {
            return create_error_action("검색 안 하실 거면 그냥 !ward recent하세여...");
        }
        const query_text = args.join(" ");
        const locinfo = create_locinfo(message.channel.id, message.author.id);
        const query_user = message.author.id;

        return create_search_action(query_user, query_text, locinfo);
    }
    else if (command === "recent") {
        const query_user = message.author.id;
        const locinfo = create_locinfo(message.channel.id, message.author.id);
        return create_search_action(query_user, ".+", locinfo, "SEARCH");
    }
    else if (command === "delete") {
        const query_text = args.length <= 0? ".+": args.join(" ");
        const locinfo = create_locinfo(message.channel.id, message.author.id);
        const query_user = message.author.id;

        return create_delete_action(query_user, query_text, locinfo)
    }
    else if (command === "help") {
        return create_help_action();
    }
    else {
        return create_error_action("그런 커맨드는 모르는데여;;;");
    }
}

function handle_action(action, get_memory, set_memory, context) {
    const previous_memory = get_memory();

    const [result, new_memory] = transfer_memory(action, previous_memory);
    output(action, result, context, act => handle_action(act, get_memory, set_memory, context));

    set_memory(new_memory);
}

// May not be pure depending on input
function handle_message_(message, get_memory, set_memory) {
    if (message.author.bot) return;
    // if (message.content.indexOf(process.env.PREFIX) !== 0) return;
    action = parse_message(message);
    handle_action(action, get_memory, set_memory, create_context(message));
}

function handle_message(message) {
    handle_message_(message, get_memory, set_memory);
}

function run() {
    client.on("ready", () => {
        console.log("I am ready!");
    });

    client.on("message", handle_message);
    client.login(process.env.TOKEN);

    /* WAIT A MINUTE, I DON'T NEED RX TO DO THIS
       const message$ = Rx.fromEvent(client, "message");
       const memory$ = new Rx.BehaviorSubject([])

       memory$.pipe(
       RxOp.switchMap(memory => message$.pipe(
       RxOp.map(msg => handle_message_test(memory, msg))
       ))
       ).subscribe(memory=>memory$.next(memory))*/
}

// For testing
module.exports = {
    handle_message_ : handle_message_,
    create_locinfo : create_locinfo,
    create_ward : create_ward,
    create_asking_query : create_asking_query,
    create_canceled_query : create_canceled_query,
    apply_query : apply_query
}
