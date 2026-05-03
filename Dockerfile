#Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build


#Stage 2: Build Scala backend fat JAR
FROM eclipse-temurin:21-jdk AS backend-build

# Install sbt manually (Reliable method, avoids missing Docker Hub tags)
RUN apt-get update && \
    apt-get install -y apt-transport-https curl gnupg && \
    echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | tee /etc/apt/sources.list.d/sbt.list && \
    curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | gpg --dearmor -o /etc/apt/trusted.gpg.d/sbt.gpg && \
    apt-get update && \
    apt-get install -y sbt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY build.sbt ./
COPY project/ project/
# Pre-fetch dependencies (cached layer)
RUN sbt update

COPY src/ src/
RUN sbt assembly


#Stage 3: Production runtime
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN apk add --no-cache curl && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy the fat JAR from backend build
COPY --from=backend-build /app/target/scala-3.3.1/spark-viz-backend.jar ./spark-viz-backend.jar

# Copy the Vite production build into /app/public
COPY --from=frontend-build /app/frontend/dist ./public

# Railway injects PORT; default to 8080 for local Docker runs
ENV PORT=8080

USER app

EXPOSE ${PORT}

ENTRYPOINT ["java", "-Xms64m", "-Xmx256m", "-XX:+UseSerialGC", "-jar", "spark-viz-backend.jar"]