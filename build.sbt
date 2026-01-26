name := "spark-viz-backend"

version := "0.1.0"

scalaVersion := "3.3.1"

libraryDependencies ++= Seq(
  // ZIO Core
  "dev.zio" %% "zio"         % "2.0.19",
  "dev.zio" %% "zio-streams" % "2.0.19",

  // ZIO HTTP for REST API
  "dev.zio" %% "zio-http" % "3.0.0-RC4",

  // JSON handling
  "dev.zio" %% "zio-json" % "0.6.2",

  // Testing
  "dev.zio" %% "zio-test"     % "2.0.19" % Test,
  "dev.zio" %% "zio-test-sbt" % "2.0.19" % Test
)

testFrameworks += new TestFramework("zio.test.sbt.ZTestFramework")

// Test coverage settings (disabled for development)
// coverageMinimumStmtTotal   := 100
// coverageMinimumBranchTotal := 100
// coverageFailOnMinimum      := false
// coverageHighlighting       := true
// coverageExcludedPackages   := "<empty>;Main"

// Assembly settings for Docker
assembly / assemblyJarName       := "spark-viz-backend.jar"
assembly / mainClass             := Some("Main")
assembly / assemblyMergeStrategy := {
  case PathList("META-INF", "MANIFEST.MF")       => MergeStrategy.discard
  case PathList("META-INF", "versions", xs @ _*) => MergeStrategy.first
  case PathList("META-INF", xs @ _*)             => MergeStrategy.discard
  case "reference.conf"                          => MergeStrategy.concat
  case "application.conf"                        => MergeStrategy.concat
  case _                                         => MergeStrategy.first
}
