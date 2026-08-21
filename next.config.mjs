/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Both database drivers must be required at runtime rather than bundled.
   * PGlite ships a WASM build whose loader the bundler rewrites into something
   * broken ("instantiateWasm is not a function"), and node-postgres resolves
   * optional native bits the same way. Neither belongs in a bundle regardless —
   * they only ever run on the server.
   */
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
};

export default nextConfig;
