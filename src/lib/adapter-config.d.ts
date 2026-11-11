// Types of the instance configuration (io-package.json → native)

declare global {
    namespace ioBroker {
        interface ChargerConfig {
            /** poll this wallbox */
            enabled?: boolean;
            /** display name of the device object */
            name?: string;
            /** IP address or host name */
            host?: string;
        }

        interface AdapterConfig {
            /** wallboxes to connect to */
            chargers: ChargerConfig[];
            /** seconds between two status requests */
            pollInterval: number;
            /** seconds until a request is aborted */
            requestTimeout: number;
            /** never send anything to the wallboxes */
            readOnly: boolean;
            /** additional API keys to expose below `raw` */
            extraKeys: string;
        }
    }
}

// this file has to be a module for the global augmentation to work
export {};
