# Pulsar SDK

A lightweight JavaScript wrapper for working with the Pulsar JS Bridge in Pulsar environments. Includes robust initialization and helper methods for all JSAPI methods.

## 🤖 Agent Skills — quick start

Teach your AI coding agent to build Pulsar apps:

```bash
npx skills add https://github.com/luminixinc/pulsar-sdk
```

Pick your agent(s) when prompted. Claude Code, Codex, Cursor, Gemini CLI, Qwen Code and 70+ others are supported. Add `--list` to preview the skills, `--all` to install every skill for every agent, or `-g` to install for all your projects.

> **The skills are evolving quickly.** We are still refining patterns and incorporating feedback, so skills may be renamed, restructured, or removed between releases. If you have forked or synced this repository, expect upstream changes that may conflict with local modifications. This repository is always the source of truth. Re-run `npx skills add` to pick up the latest version.

## 🚀 Features

- Automatic detection of Pulsar bridge context (native or embedded)
- Safe and async initialization
- Built-in cleanup to prevent memory leaks
- Promise-based request handling

## Important Notes
- All values stored in the SQLite Database are stored as strings.

## 📦 Getting Started

To get your AI coding harnesses started quickly with the Pulsar SDK, install the Pulsar SDK Agent Skills: `npx skills add https://github.com/luminixinc/pulsar-sdk`
 
To make use of the Pulsar SDK, you'll need to familiarize yourself with the [process of creating a .pulsarapp](https://luminix.atlassian.net/wiki/spaces/PD/pages/49152017/Pulsar+as+a+Platform#Bundling-and-deploying-your-webapp-as-.pulsarapp-format). 

To make use of this in your custom Pulsar app, download the pulsar.js file and include it in your project. The following script snippet will connect you to the Pulsar platform and return the pulsar object for you to begin developing. You may wish to adjust the object type and arguments sent to the `read` call to suit your own organizations data.

``` html
<script type="module">
  import { Pulsar } from './path/to/pulsar.js';

  (async () => {
    try {
      const pulsar = new Pulsar();
      await pulsar.init();

      const records = await pulsar.read('Account', { Name: 'ACME Corp' });

      if (records.length === 0) {
        console.log('No matching accounts found.');
      } else {
        console.log('Accounts:', records);
      }
    } catch (error) {
      console.error('An error occurred while using Pulsar:', error);
    }
  })();
</script>

```
