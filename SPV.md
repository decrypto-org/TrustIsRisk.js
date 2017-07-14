# Trust is Risk SPV node

## Motivation

To make Trust is Risk accessible to users who do not wish or are unable to maintain a full bitcoin node, it is necessary to
expand our specification to enable [SPV nodes](https://bitcoin.org/en/glossary/simplified-payment-verification) to interact
with Trust is Risk.

## General design

The design goal is for an SPV node to be able to request for all Trust is Risk transactions. Ideally this should be achieved
without the need of any structural change to the communication protocol nor to the serving full node. A specially crafted
"Trust is Risk" tag should be added to all Trust is Risk transactions that has two properties:
1. It distinguishes Trust is Risk transactions in a way that SPV nodes can request specifically for them.
2. A transaction with such a tag abides by the rules that define a standard transaction in order for the default bitcoin nodes
   to accept it.

Indeed, this target is achievable as will become clear.

## Background for SPV

Before requesting for transactions, an SPV node defines a [Bloom filter](https://en.wikipedia.org/wiki/Bloom_filter) as
described in the [bitcoin developer guide](https://bitcoin.org/en/developer-guide#bloom-filters) in order to narrow down the
set of transactions it is interested in receiving and then sends it to the serving full node with the
[`filterload`](https://bitcoin.org/en/developer-reference#filterload) message. The full node then checks each transaction for
membership in the Bloom filter before sending it to the SPV node and sends only the ones that match the filter.

## Standard transactions

On the other hand, in order for a transaction to be relayed by a node before being included in a block, it must be of one of
the [standard](https://bitcoin.org/en/developer-guide#standard-transactions) types. By checking the relevant parts of the
reference [implementation](https://github.com/bitcoin/bitcoin/blob/master/src/policy/policy.cpp) we can deduce that a standard
P2PKH transaction has no room for anything that could serve as a "Trust is Risk" tag in the pubkey script. A standard (bare, non
P2SH) Multisig transaction uses up to three different public keys and its structure is thoroughly checked. On the other hand,
signature scripts are not checked for being standard as thoroughly as pubkey scripts, the only thing that is checked is whether
all instructions contained are push-only.

## Putting the pieces together

In order to effectively use Bloom filters, we have to understand which parts of each transaction the full node checks against
the filter. According to the [bitcoin developer reference](https://bitcoin.org/en/developer-reference#filterload): 
> [E]ach element pushed onto the stack by a data-pushing opcode in a signature script from this transaction is individually
> compared to the filter.

> [E]ach element pushed onto the stack by a data-pushing opcode in any pubkey script from this transaction is individually
> compared to the filter.

This means that the tag can be either part of the signature or of the pubkey script and it should be pushed onto the stack.
Thus, in order for trust increasing and trust decreasing transactions to have a constant location for the tag, there are two
paths to follow:
1. Place the tag in the beginning of the signature script. In a trust increasing transaction, since it is spending a P2PKH,
   this means that the (unique) signature script becomes
   ```<tag> <sig> <pubkey>```
   from
   ```<sig> <pubkey>```
   On the other hand, a trust decreasing transaction spends a Multisig. Due to an error in the original implementation, an
   additional dummy instruction is needed in the beginning of the signature script. This dummy instruction can be replaced with
   the desired tag. The (unique) signature script becomes
   ```<tag> <A sig> <B sig>```
   from
   ```OP_0 <A sig> <B sig>```
2. Place the tag in the pubkey script. Both types of Trust is Risk transactions have exactly one Multisig output and thus in
   this case we do not need to treat them differently. Since a Multisig with up to three public keys is considered standard, a
   dummy pseudo-public key identical for all Trust is Risk transactions that will serve as the desired tag can be placed in the
   position of the third public key. This way the pubkey script corresponding to the Multisig becomes
   ```OP_1 <A pubkey> <B pubkey> <tag> OP_3 OP_CHECKMULTISIG```
   from
   ```OP_1 <A pubkey> <B pubkey> <C pubkey> OP_3 OP_CHECKMULTISIG```
   In this case, the ```<tag>``` must resemble a public key in format, but be generated in such a way that it is provable that
   the corresponding private key is not known. There always exists a tiny probability of a private key that corresponds to the
   tag to be found and someone finding this private key will be able to spend all Trust is Risk transactions in the UTXO, thus
   such this way of implementing the tag should be avoided if possible.
