const Ward = require("../main.js");
const Should = require("should");
const R = require("ramda");

/*

Input -> Computation -> Output w/State

테스트할 것



*/

function create_message_manager(put, edit, del) {
    return {
        "put": put, "edit": edit, "del": del
    }
}

// Presuming not using actual ids / urls don't affect the result
function create_fake_message(content, channel="1", author="01", message_manager) {
    if( typeof create_fake_message.counter == 'undefined' ) {
        create_fake_message.counter = 0;
    }
    create_fake_message.counter += 1;
    const url = "message" + create_fake_message.counter;

    const message = {"content": content,
            "id": create_fake_message.counter.toString(),
            "channel": {"id": channel, "send": m => new Promise((rs, rj) => {
                message_manager.put(m);
                rs(message)
            }),
                        "fetchMessage": id => new Promise((rs, rj) => rs(
                            create_fake_message("query", channel, author, message_manager))) },
            "author": {"id": author},
            "edit": msg => message_manager.edit(msg),
            "delete": msg => message_manager.del(msg),
            "url": url}

    return message;
}

describe("Constructor test", function () {
    describe("Create Locinfo", function () {
        it("Locinfo should consist of channel and user", function () {
            const linfo = Ward.create_locinfo("123", "456");
            linfo.should.have.properties(["channel", "user"]);
        });
        it("Channel and user id must consist of numbers", function () {
            (()=> Ward.create_locinfo("a1234", "123")).should.throw();
            (()=> Ward.create_locinfo("", "123")).should.throw();
            (()=> Ward.create_locinfo("1  2", "123")).should.throw();
            (()=> Ward.create_locinfo("123", "a1234")).should.throw();
            (()=> Ward.create_locinfo("3441", "")).should.throw();
            (()=> Ward.create_locinfo("", "1   2")).should.throw();
        });
    });
    describe("Create Ward", function () {
        it("Ward should consist of Desc, Url and Locinfo", function () {
            const ward = Ward.create_ward("test", "http://discord.com/msg/123",
                                           Ward.create_locinfo("1234", "5678"));
            ward.should.have.properties(["desc", "url", "locinfo"]);
        });
    });
    describe("Create Query", function () {
        it("Query should consist of State, Page, Choices and Query Action", function () {
            const asking_query = Ward.create_asking_query(1, []);
            const canceled_query = Ward.create_canceled_query();
            asking_query.should.have.properties(["state", "page", "choices", "query_action"]);
            canceled_query.should.have.properties(["state", "page", "choices", "query_action"]);
        });
    });
    // Create (Search / Add / Print / Delete) action
});

describe("Tests from found bugs", function () {
    it("apply_query shouldn't override 'wards' property", function () {
        const memory = { "wards": {"1": {"2": "wwwww" }}};
        const query = Ward.create_asking_query(1, [], "SEARCH");
        Ward.apply_query(query, "2", memory).should.deepEqual(
            { "wards": {"1": {"2": "wwwww" }}, "queries": {"2": query}}
        )
    });
});

/*
describe("Command parsing test", function () {
    describe("", function () {
    });
});

describe("Transition Function Test", function () {
    describe("Set command", function () {});
});

describe("Ward Set State Transition Test", function () {
    describe("Add ward", function () {
        it("", function () {
        });
    });
}); */ // 이것들은 터지면 짜는 걸로... 

describe("Behaviour Test", function () {
    function process_messages(messages) {
        let sample_memory = {};
        let logs = [];
        let previous_channel = "$";

        const set_memory = memory => sample_memory = memory;
        const get_memory = () => sample_memory;
        const reply = text => logs.push(text);

        const edit = reply;

        const del = (text) => reply(text).then(id => reply("(삭제됨)"));

        const message_manager = create_message_manager(reply, reply, del);

        for(message of messages) {
            [channel, user, content] = message;
            logs = [];

            if(channel !== previous_channel)
                console.log(`====== ${channel} ======`);

            console.log(`${user} : ${content}`);
            Ward.handle_message_(create_fake_message(content, channel, user, message_manager),
                                 get_memory, set_memory, reply);

            for(r of logs) {
                console.log(r);
            }

            previous_channel = channel;
        }
    }

    describe("Suite 1 (Same user, same channel)", function () {
        const messages = [
            // channel, user, command
            ["1", "0", "!wad asdf"], // invalid command
            ["1", "0", "!ward asdf"], // invalid sub-command
            ["1", "0", "!ward set"], // invalid argument
            ["1", "0", "!ward search asdf"], // no search result (when ward list empty)
            ["1", "0", "!ward set test"], // set test
            ["1", "0", "!ward set te s t i n g"], // set test (containing spaces)
            ["1", "0", "!ward set 테스트"], // set test (containing hangul)
            ["1", "0", "!ward search asdf"], // no search result (when not empty)
            ["1", "0", "!ward search te"], // search test
            ["1", "0", "c"], // cancel
            ["1", "0", "!ward set 1asdf1"], // setup for search
            ["1", "0", "!ward set 2asdf2"], // setup for search
            ["1", "0", "!ward set 3asdf3"], // setup for search
            ["1", "0", "!ward set 4asdf4"], // setup for search
            ["1", "0", "!ward set 5asdf5"], // setup for search
            ["1", "0", "!ward set 6asdf6"], // setup for search
            ["1", "0", "!ward set 7asdf7"], // setup for search
            ["1", "0", "!ward set 8asdf8"], // setup for search
            ["1", "0", "!ward set 9asdf9"], // setup for search
            ["1", "0", "!ward set AasdfA"], // setup for search
            ["1", "0", "!ward set BasdfB"], // setup for search
            ["1", "0", "!ward search asdf"], // search test (manny)
            ["1", "0", "n"], // next page
            ["1", "0", "p"], // previous page
            ["1", "0", "n"], // next page
            ["1", "0", "5"], // select
            ["1", "0", "1"], // try selecting when query is off
            ["1", "0", "!ward recent"], // recent
            ["1", "0", "2"], // select
            ["1", "0", "!ward delete asdf"], // delete
            ["1", "0", "1"], // select
            ["1", "0", "!ward search asdf"], // see if it's deleted
            ["1", "0", "c"], // cancel
            ["1", "0", "!ward delete"], // delete without args
            ["1", "0", "3"], // select
            ["1", "0", "!ward recent"], // see if it's deleted
            ["1", "0", "c"] // cancel
        ]

        it("Check the log for yourself!", function () {
            process_messages(messages);
        });
    });
});

/* describe("Behaviour Test (deprecated)", function () {
    describe("Suite 1 (consecutive, deprecated)", function () {
        let sample_memory = {};
        let logs = [];
        const set_memory = memory => sample_memory = memory;
        const get_memory = () => sample_memory;
        const reply = text => new Promise(function (resolve, reject) {
            logs.push(text);
            resolve({id: "a"});
        });

        it("If received a message which is not command, should ignore", function () {
            const message = create_fake_message("!wad asdf");
            Ward.handle_message_(message, get_memory, set_memory, reply);
            logs.should.deepEqual([]);
            sample_memory.should.deepEqual({});
        });

        it("Invalid command should do nothing", function () {
            const message1 = create_fake_message("!ward asdf");
            const message2 = create_fake_message("!ward set");
            Ward.handle_message_(message1, get_memory, set_memory, reply);
            Ward.handle_message_(message2, get_memory, set_memory, reply);
            sample_memory.should.deepEqual({});
        });

        it("'!ward search asdf' should return no result", function () {
            const message = create_fake_message("!ward search asdf");
            Ward.handle_message_(message, get_memory, set_memory, reply);
            // How am I supposed to test this?
            logs[logs.length - 1].should.equal("검색 결과가 없어요...");
        });

        it("'!ward set test' should update the memory", function () {
            const message = create_fake_message("!ward set test");

            Ward.handle_message_(message, get_memory, set_memory, reply);

            const locinfo = Ward.create_locinfo("1","01");
            const ward = Ward.create_ward("test", `message${create_fake_message.counter}`, locinfo);
            sample_memory.should.deepEqual(
                {"wards":{
                    "1":{"01": [ward] } }}
            );
        });

        it("'!ward set test2', this is just for future testing", function () {
            const message = create_fake_message("!ward set test2");
            Ward.handle_message_(message, get_memory, set_memory, reply);
        });
        
        it("'!ward search asdf' shouldn't set query state", function () {
            const message = create_fake_message("!ward search asdf");
            Ward.handle_message_(message, get_memory, set_memory, reply);
            const query_state = R.view(
                R.lensPath(["queries", "01"]),
                sample_memory
            );
            Should(query_state).not.deepEqual(
                Ward.create_asking_query(1, [], "SHOW")
            );
        });

        it("`!ward search te` should respond to query", function () {
            const search_msg = create_fake_message("!ward search te");
            Ward.handle_message_(search_msg, get_memory, set_memory, reply);
            const query_msg = create_fake_message("1");
            Ward.handle_message_(query_msg, get_memory, set_memory, reply);
            // console.log(logs[logs.length - 1]);
        });

        it("n and p while searching should change the page", function () {
            const set_ward_msgs = [
                create_fake_message("!ward set 1asdf1"),
                create_fake_message("!ward set 2asdf2"),
                create_fake_message("!ward set 3asdf3"),
                create_fake_message("!ward set 4asdf4"),
                create_fake_message("!ward set 5asdf5"),
                create_fake_message("!ward set 6asdf6"),
                create_fake_message("!ward set 7asd f7"),
                create_fake_message("!ward set 8asdf8"),
                create_fake_message("!ward set 9asdf9"),
                create_fake_message("!ward set AasdfA"),
                create_fake_message("!ward set BasdfB"),
            ];

            for (msg of set_ward_msgs)
                Ward.handle_message_(msg, get_memory, set_memory, reply);

            const search_msg = create_fake_message("!ward search asdf");
            const next_msg = create_fake_message("n");
            const prev_msg = create_fake_message("p");
            const next_msg2 = create_fake_message("n");
            const select_msg = create_fake_message("5");
            const select_msg2 = create_fake_message("1");

            Ward.handle_message_(search_msg, get_memory, set_memory, reply);
            Ward.handle_message_(next_msg, get_memory, set_memory, reply);
            Ward.handle_message_(prev_msg, get_memory, set_memory, reply);
            Ward.handle_message_(next_msg2, get_memory, set_memory, reply);
            Ward.handle_message_(select_msg, get_memory, set_memory, reply);
            Ward.handle_message_(select_msg2, get_memory, set_memory, reply);
        });

        it("!ward recent shall give recent wards", function () {
            const msg = create_fake_message("!ward recent");
            Ward.handle_message_(msg, get_memory, set_memory, reply);
        });
    });
}); */
