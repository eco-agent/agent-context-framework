# Product contract

The application exposes one status page and one health endpoint. The status page
identifies the repository as an ACF test application. The health endpoint returns
JSON with an `ok` value of `true`.

The application intentionally has no third-party runtime dependencies. This keeps
fixture generation independent of network and package-registry availability.
