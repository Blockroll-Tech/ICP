# Blockroll Implementation of ICP

###### This repo showcases our Icp module and how we communicate with the network.

## Workers Folder (Thread workers)

This folder holds the worker class that creates a single Thread to handle the encryption and decryption of privateKeys. It uses a library called [crypto](https://github.com/MauriceButler/cryptr) Version 6.3.0.

Note: Before any upgrade the open source repo will be studied. After we created a custom Class to handle encryption using Node crypto, we came across this open source software that uses same method . So, we decided to stick with it and contribute whenever neccessary.

## ICP Folder

#### Model

This is the collection schema used for storing user details on our database.

#### Types

Used to structure the schema and DTO .

#### Service

##### generateWallet() for creation of wallets . Uses the thread to encrypt and then stores on the db.

##### getCkUSDCBalance() to get user balance.

##### transferCkUSDC Allows user transfer USDC to others on the network

##### getLatestTx() gets the user transaction history from the ICP network and stores on our db.

All Other functions in the service aids these functions to work efficiently.

```bash
pip install foobar
```

## Usage

```javascript
import IcpService from "./icp";

let Icp = new IcpService();
await Icp.generateWallet("User._id");
```
