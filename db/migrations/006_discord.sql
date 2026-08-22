-- Discord, where a lot of small shops actually keep their customers.
--
-- An invite code rather than a username: what a store wants over its door is
-- "come and join us", and discord.gg/<code> is the only Discord link that
-- means anything to somebody who is not already a member.

alter table lots add column if not exists social_discord text;
