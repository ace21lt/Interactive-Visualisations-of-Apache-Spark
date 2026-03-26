package config

import zio.*

// Reads configuration values from environment variables
object ConfigReader:

  // Read optional string environment variable
  def getOptionalEnv(name: String): UIO[Option[String]] =
    ZIO.succeed(sys.env.get(name).map(_.trim).filter(_.nonEmpty))

  // Read integer environment variable with bounds checking
  def getOptionalEnvInt(name: String, default: Int, min: Int, max: Int): UIO[Int] =
    ZIO.succeed {
      sys.env.get(name).flatMap(_.toIntOption) match
        case Some(v) if v >= min && v <= max => v
        case _                               => default
    }

  // Read double environment variable with bounds checking
  def getOptionalEnvDouble(name: String, default: Double, min: Double, max: Double): UIO[Double] =
    ZIO.succeed {
      sys.env.get(name).flatMap(_.toDoubleOption) match
        case Some(v) if v >= min && v <= max => v
        case _                               => default
    }

  // Read boolean environment variable
  def getOptionalEnvBoolean(name: String, default: Boolean): UIO[Boolean] =
    ZIO.succeed {
      sys.env.get(name).map(_.toLowerCase) match
        case Some("true") | Some("1") | Some("yes") => true
        case Some("false") | Some("0") | Some("no") => false
        case _                                      => default
    }
