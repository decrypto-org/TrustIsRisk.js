[policy/policy.cpp](https://github.com/bitcoin/bitcoin/blob/master/src/policy/policy.cpp): 

IsStandardTx(tx, reason, witnessEnabled) -> 

ScriptSig has to contain only valid instructions up to OP_16 (OP_0 - OP_16, OP_FALSE, OP_PUSHDATA{1,2,4}, OP_1NEGATE, OP_RESERVED, OP_TRUE) && 

ScriptPubKey has to match exactly the [developer guide specification](https://bitcoin.org/en/developer-guide#standard-transactions).

Unfortunately, the error of the implementation cannot be exploited, as we can see in the [Solver()](https://github.com/bitcoin/bitcoin/blob/6dbcc74a0e0a7d45d20b03bb4eb41a027397a21d/src/script/standard.cpp#L40) definition.
