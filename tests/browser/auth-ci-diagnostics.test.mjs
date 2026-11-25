import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailure} from './auth-ci-diagnostics.mjs';
test('private runtime text emits only fixed codes',()=>{
 for(const [input,expected] of [['secret=abc SQLSTATE 42P01','MIGRATION_SQL'],['secret=abc','UNCLASSIFIED'],['unknown flag secret=abc','CLI_FLAG'],['container unhealthy','SERVICE_UNHEALTHY'],['address already in use','PORT_BIND']]) assert.equal(classifyFailure(input),expected);
});
