# ================================
# Build image
# ================================
# Allow overriding the platform at build time (defaults keep Cloud Run-compatible linux/amd64 artifacts).
ARG SWIFT_PLATFORM=linux/amd64
ARG RUNTIME_PLATFORM=${SWIFT_PLATFORM}
FROM --platform=${SWIFT_PLATFORM} swift:6.1-noble AS build

# Install OS updates
RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q upgrade -y \
    && apt-get install -y libjemalloc-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Set up a build area
WORKDIR /build

# First just resolve dependencies.
# This creates a cached layer that can be reused
# as long as your Package.swift/Package.resolved
# files do not change.
COPY ./Package.* ./
RUN swift package resolve \
        $([ -f ./Package.resolved ] && echo "--force-resolved-versions" || true)

# Copy entire repo into container
COPY . .
RUN rm -rf ./.build # Clean up any existing build artifacts

RUN mkdir /staging

# Build the application with optimizations and link against jemalloc
RUN swift build -c release \
        --product VaporDockerApp \
        -Xlinker -ljemalloc && \
    # Copy main executable to staging area
    cp "$(swift build -c release --show-bin-path)/VaporDockerApp" /staging && \
    # Copy resources bundled by SPM to staging area
    find -L "$(swift build -c release --show-bin-path)" -regex '.*\.resources$' -exec cp -Ra {} /staging \;


# Switch to the staging area
WORKDIR /staging

# Copy static swift backtracer binary to staging area
RUN cp "/usr/libexec/swift/linux/swift-backtrace-static" ./

# Copy any resources from the public directory and views directory if the directories exist
# Ensure that by default, neither the directory nor any of its contents are writable.
RUN [ -d /build/Public ] && { mv /build/Public ./Public && chmod -R a-w ./Public; } || true
RUN [ -d /build/Resources ] && { mv /build/Resources ./Resources && chmod -R a-w ./Resources; } || true

# ================================
# Run image
# ================================
FROM --platform=${RUNTIME_PLATFORM} ubuntu:noble
ARG RDS_CERT_URL=https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem
ENV PGSSLROOTCERT=/usr/local/share/ca-certificates/rds-ca.pem

# Make sure all system packages are up to date, and install only essential packages.
RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get -q install -y \
      ca-certificates \
      curl \
      libjemalloc2 \
      libcurl4 \
      tzdata \
    && curl -sSL "$RDS_CERT_URL" -o "$PGSSLROOTCERT" \
    && chmod 0644 "$PGSSLROOTCERT" \
    && update-ca-certificates \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Create a vapor user and group with /app as its home directory
RUN useradd --user-group --create-home --system --skel /dev/null --home-dir /app vapor

# Switch to the new home directory
WORKDIR /app

# Copy built executable and any staged resources from builder
COPY --from=build --chown=vapor:vapor /staging /app

# Copy Swift runtime libraries that are required because we no longer statically link them
COPY --from=build /usr/lib/swift /usr/lib/swift

# Provide configuration needed by the built-in crash reporter and some sensible default behaviors.
ENV SWIFT_BACKTRACE=enable=yes,sanitize=yes,threads=all,images=all,interactive=no,swift-backtrace=./swift-backtrace-static

# Ensure all further commands run as the vapor user
USER vapor:vapor

# Let Docker bind to port 8080
EXPOSE 8080

# Start the Vapor service when the image is run, default to listening on 8080 in production environment
ENTRYPOINT ["./VaporDockerApp"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8080"]
