import {Credential} from '../models';
import * as bs58 from 'bs58';
import * as nearAPI from 'near-api-js';
import {numberToHex, hexToU8a} from '@polkadot/util';
import nacl from 'tweetnacl';

/* eslint-disable  @typescript-eslint/naming-convention */
export class Near {
  static async verifyAccessKey(
    credential: Credential,
    rpcURL: string,
    accountId: string,
  ): Promise<boolean> {
    const {publicAddress} = credential;

    try {
      const pk = 'ed25519:' + bs58.encode(Buffer.from(hexToU8a(publicAddress)));
      const provider = new nearAPI.providers.JsonRpcProvider({url: rpcURL});
      const result = await provider.query({
        request_type: 'view_access_key',
        account_id: accountId,
        public_key: pk,
        finality: 'final',
      });

      return Boolean(result);
    } catch {
      return false;
    }
  }

  static signatureVerify(credential: Credential): boolean {
    const {nonce, signature, publicAddress} = credential;
    const publicKey = publicAddress.replace('0x', '');

    return nacl.sign.detached.verify(
      Buffer.from(numberToHex(nonce)),
      Buffer.from(hexToU8a(signature)),
      Buffer.from(publicKey, 'hex'),
    );
  }
}