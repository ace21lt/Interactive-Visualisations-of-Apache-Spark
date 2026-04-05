package config

import service.DatabricksError

import java.net.{IDN, InetAddress, URI}

object WorkspaceUrlValidator {

  trait DnsResolver {
    def resolveAll(host: String): Either[DatabricksError.ValidationError, List[InetAddress]]
  }

  object DnsResolver {
    val live: DnsResolver = host =>
      try Right(InetAddress.getAllByName(host).toList)
      catch {
        case _: Exception => Left(DatabricksError.ValidationError("Could not resolve workspace host"))
      }
  }

  def validate(url: String): Either[DatabricksError.ValidationError, String] =
    validate(url, DnsResolver.live)

  def validate(url: String, dns: DnsResolver): Either[DatabricksError.ValidationError, String] = {
    val trimmed = Option(url).map(_.trim).getOrElse("")
    if (trimmed.isEmpty) return Left(DatabricksError.ValidationError("Workspace URL is required"))

    val uri =
      try new URI(trimmed)
      catch {
        case _: Exception =>
          return Left(DatabricksError.ValidationError("Invalid workspace URL"))
      }

    val scheme = Option(uri.getScheme).getOrElse("").toLowerCase
    if (scheme != "https") return Left(DatabricksError.ValidationError("Workspace URL must start with https://"))

    val hostRaw = Option(uri.getHost).getOrElse("")
    if (hostRaw.isEmpty) return Left(DatabricksError.ValidationError("Workspace URL must include a host"))

    val host = IDN.toASCII(hostRaw).toLowerCase

    // Domain allow-list
    val allowedDomain = host.endsWith(".databricks.com")
    if (!allowedDomain) {
      return Left(DatabricksError.ValidationError("Workspace URL must be a Databricks domain (.databricks.com)"))
    }

    if (host == "localhost" || host.endsWith(".localhost")) {
      return Left(DatabricksError.ValidationError("localhost is not allowed"))
    }

    // Resolve DNS and block private / loopback / link-local / multicast / etc.
    val addresses = dns.resolveAll(host)
    addresses match {
      case Left(err)    => Left(err)
      case Right(addrs) =>
        val bad = addrs.exists(isDisallowedAddress)
        if (bad) Left(DatabricksError.ValidationError("Workspace host resolves to a private or reserved IP address"))
        else Right(trimmed.stripSuffix("/"))
    }
  }

  private def isDisallowedAddress(addr: InetAddress): Boolean =
    addr.isAnyLocalAddress ||
      addr.isLoopbackAddress ||
      addr.isLinkLocalAddress ||
      addr.isSiteLocalAddress ||
      addr.isMulticastAddress ||
      addr.getHostAddress == "0.0.0.0" ||
      addr.getHostAddress == "::" ||
      isInCidr(addr, "100.64.0.0", 10)

  private def isInCidr(addr: InetAddress, baseIpV4: String, prefixBits: Int): Boolean = {
    val a = addr.getAddress
    if (a.length != 4) return false

    val base = InetAddress.getByName(baseIpV4).getAddress

    val mask =
      if (prefixBits == 0) 0
      else -1 << (32 - prefixBits)

    def toInt(bytes: Array[Byte]): Int = {
      def u8(i: Int): Int = bytes(i) & 0xff

      val b0 = u8(0) << 24
      val b1 = u8(1) << 16
      val b2 = u8(2) << 8
      val b3 = u8(3)

      b0 | b1 | b2 | b3
    }

    (toInt(a) & mask) == (toInt(base) & mask)
  }
}
