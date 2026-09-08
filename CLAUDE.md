# Project overview
This repo builds one app containing two products: a personal WhatsApp+voice
PA, and a "Business Board" CRM tool for small business owners. They share
an app shell, auth, and backend, but are otherwise separate products for now
(see business-board-spec.md, Phase 4, for the planned integration).

Full specs live in this repo's root — pa-whatsapp-spec.md,
business-board-spec.md, design-ux-localization-spec.md, and
build-sequence.md — always read the relevant one before building a
session's scope, and always apply design-ux-localization-spec.md
(warm & personal visual direction, English+Hebrew with RTL support built
in from the start, not retrofitted).

Build order: see build-sequence.md. Only build the scope of the
current session — don't jump ahead to later phases.
