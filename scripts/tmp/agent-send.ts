import { sendSmsCode } from "../../src/lib/agent-discovery.server";
console.log(JSON.stringify(await sendSmsCode("a2291d2c-1d0f-4a3d-a61f-3c0016815764", "+16784853054")));
