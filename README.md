# Pulsar SDK

A lightweight JavaScript wrapper for working with the Pulsar JS Bridge in Pulsar environments. Includes robust initialization and helper methods for all JSAPI methods.

## 🚀 Features

- Automatic detection of Pulsar bridge context (native or embedded)
- Safe and async initialization
- Built-in cleanup to prevent memory leaks
- Promise-based request handling

## Important Notes
- All values stored in the SQLite Database are stored as strings.

## 📦 Getting Started
 
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
