# Multi-stage Dockerfile for Scala/ZIO Backend
# Stage 1: Build the application using sbt
FROM eclipse-temurin:21-jdk AS builder

# Install sbt via official method (works on both ARM64 and x86_64)
RUN apt-get update && \
    apt-get install -y apt-transport-https curl gnupg && \
    echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | tee /etc/apt/sources.list.d/sbt.list && \
    curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | gpg --dearmor -o /etc/apt/trusted.gpg.d/sbt.gpg && \
    apt-get update && \
    apt-get install -y sbt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy only build configuration first to leverage Docker layer caching
COPY project/build.properties project/
COPY project/plugins.sbt project/
COPY build.sbt .

# Download dependencies (cached layer)
RUN sbt update

# Copy source code
COPY src/ src/

# Build the fat JAR using sbt-assembly
RUN sbt assembly

# Verify the JAR was created
RUN ls -lh target/scala-3.3.1/spark-viz-backend.jar

# Stage 2: Runtime image with minimal footprint
FROM eclipse-temurin:21-jre-jammy

LABEL maintainer="Interactive Visualisations of Apache Spark Team"
LABEL description="Scala/ZIO backend for Spark visualisation"
LABEL version="0.1.0"

# Install wget for healthchecks
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copy the fat JAR from builder stage
COPY --from=builder /build/target/scala-3.3.1/spark-viz-backend.jar /app/spark-viz-backend.jar

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose the application port
EXPOSE 8080

# Health check to ensure the service is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the application
ENTRYPOINT ["java"]
CMD ["-XX:+UseContainerSupport", \
     "-XX:MaxRAMPercentage=75.0", \
     "-XX:+UseG1GC", \
     "-XX:+UseStringDeduplication", \
     "-Djava.security.egd=file:/dev/./urandom", \
     "-jar", \
     "spark-viz-backend.jar"]
