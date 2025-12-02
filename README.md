# Interactive Visualisations of Apache Spark




## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your Databricks credentials

# 2. Run the backend
./run.sh

# 3. Test the API
curl http://localhost:8080/health
curl -X POST http://localhost:8080/trigger
```

## Development

```bash
# Format code
sbt scalafmtAll

# Compile
sbt compile

# Run tests with coverage (when added)
sbt clean coverage test coverageReport

# Check coverage meets 100% requirement
sbt coverageAggregate
```


