# Repository guide

## Map and setup

This is the historical Passenger `stable-5.0` branch. `src/agent/` and `src/cxx_supportlib/` hold the C++ server core; `src/ruby_supportlib/`, `src/ruby_native_extension/`, and the Apache/Nginx modules hold runtime integration. `build/` defines Rake tasks; `test/` holds unit/integration suites; `dev/` and `doc/` document developer tooling.

Read the relevant `CONTRIBUTING.md` sections for coding conventions and test prerequisites. It requires a contributor agreement for upstream contributions; a fork change is not permission to submit upstream. Development needs a compatible Ruby/Bundler toolchain, C/C++ compiler and headers, and the dependencies for the chosen test lane. Preserve `Gemfile.lock` and `npm-shrinkwrap.json`. Initialize the pinned submodules when needed with `git submodule update --init --recursive`.

The documented `rake test:install_deps` installs developer tools; inspect it before use and do not add `SUDO=1` without authorization. Copy/configure `test/config.json.example` locally for tests without exposing values. `rake apache2` and `rake nginx` compile their components; bare `rake` only prints that choice. Installers in `bin/` can modify a host web server and are not build checks.

## Verification and completion

Use the affected lane: `rake test:cxx`, `rake test:oxt`, `rake test:ruby`, or `rake test:node` (`npm test` delegates to the latter). C++ filtering supports `GROUPS='UtilsTest'`; `rake test` also runs integration suites and needs their server prerequisites. Do not run privileged tests or alter live Apache/Nginx services without explicit authorization. No single standalone lint gate is defined; follow the language conventions and inspect the diff.

Start with `git status --short`, preserve unrelated changes, and finish authorized local work through focused checks and repairs. Make routine reversible choices directly. Report exact legacy compiler/dependency/test-config blockers while continuing independent checks. For prose-only edits, verify references and run `git diff --check`; close with paths, actual results, and unverified integration behavior. Keep credentials and historical notification configuration values out of logs.
