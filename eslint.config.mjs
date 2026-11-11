import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        ignores: ['build/', 'admin/', 'test/', 'node_modules/', '*.mjs'],
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
