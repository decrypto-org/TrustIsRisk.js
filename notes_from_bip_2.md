Here we find the information from the [BIP process](https://github.com/bitcoin/bips/blob/master/bip-0002.mediawiki) that is
relevant for us, paraphrased for brevity.

# Workflow

1. Search past discussions to see if an idea has been considered before, and if so, what issues arose in its progression.
2. Post about the new idea to the [Bitcoin development mailing
list](https://lists.linuxfoundation.org/mailman/listinfo/bitcoin-dev) and get the community to answer whether the idea has any
chance of acceptance.
3. Present a draft BIP to the [Bitcoin development mailing
list](https://lists.linuxfoundation.org/mailman/listinfo/bitcoin-dev) and pass some improvement rounds.
4. Pull request the proposal to the [BIPs git repository](https://github.com/bitcoin/bips) with alias
"bip-decrypto-org-trustisrisk-spv" or similar.

During the above, long open-ended discussions on public mailing lists should be avoided. Strategies to keep the discussions
efficient include: setting up a separate SIG mailing list for the topic, having the BIP author accept private comments in the
early design phases, setting up a wiki page or git repository, etc.

The current BIP editor, Luke Dashjr ([luke_bipeditor@dashjr.org](mailto:luke_bipeditor@dashjr.org)), will check, amongst other
things, that:

1. The BIP draft has been sent to the [Bitcoin development mailing
list](https://lists.linuxfoundation.org/mailman/listinfo/bitcoin-dev)
2. Backwards compatibility is addressed.
3. A correct [Layer](https://github.com/bitcoin/bips/blob/master/bip-0123.mediawiki) header is assigned. ([BIP 37 - Bloom
filters](https://github.com/bitcoin/bips/blob/master/bip-0037.mediawiki) is in the Peer Services Layer and probably so should
we.)

# Format and structure

format: mediawiki

structure:
1. Preamble
2. Abstract
3. Copyright
4. Specification
5. Motivation
6. Rationale
7. Backwards compatibility
8. Reference implementation (Can be done in the step between Draft and Proposed)
 
# Types

1. Standards Track BIP
2. Informational BIP
3. Process BIP

[BIP 37 - Bloom filters](https://github.com/bitcoin/bips/blob/master/bip-0037.mediawiki) is a Standards Track BIP. We probably
are a Process BIP.

# Status field

We start out as draft and proceed from there.

Please note:

>What if a BIP is proposed that only makes sense for a single specific project?
>
> *   The BIP process exists for standardisation between independent projects. If something only affects one project, it
>     should be done through that project's own internal processes, and never be proposed as a BIP in the first place.

# Comments

1. Made in corresponding wiki page
2. Comments used only after BIP completion, except for widely viewed/slowly advancing non-completed BIP.

# Licensing

An OR-list of licenses for the BIP and another OR-list of licenses for the code in the BIP are required in the header.

## Recommended licenses

1. BSD-2-Clause: [OSI-approved BSD 2-clause license](https://opensource.org/licenses/BSD-2-Clause)
2. BSD-3-Clause: [OSI-approved BSD 3-clause license](https://opensource.org/licenses/BSD-3-Clause)
3. CC0-1.0: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
4. GNU-All-Permissive: [GNU All-Permissive
License](http://www.gnu.org/prep/maintain/html_node/License-Notices-for-Other-Files.html)

## Acceptable licenses

1. Apache-2.0: [Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
2. BSL-1.0: [Boost Software License, version 1.0](http://www.boost.org/LICENSE_1_0.txt)
3. CC-BY-4.0: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
4. CC-BY-SA-4.0: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
5. MIT: [Expat/MIT/X11 license](https://opensource.org/licenses/MIT)
6. AGPL-3.0+: [GNU Affero General Public License (AGPL), version 3 or newer](http://www.gnu.org/licenses/agpl-3.0.en.html)
7. FDL-1.3: [GNU Free Documentation License, version 1.3](http://www.gnu.org/licenses/fdl-1.3.en.html)
8. GPL-2.0+: [GNU General Public License (GPL), version 2 or newer](http://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
9. LGPL-2.1+: [GNU Lesser General Public License (LGPL), version 2.1 or
newer](http://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html)
