# =========================================================
# WinSCP.ini Decryptor (FULL + CORRECT IMPLEMENTATION)
# Reads WinSCP.ini from same directory
# Outputs: Table + JSON
# =========================================================

$iniPath = Join-Path $PSScriptRoot "WinSCP.ini"
$jsonOutputPath = Join-Path $PSScriptRoot "winscp_credentials.json"

if (!(Test-Path $iniPath)) {
    Write-Error "WinSCP.ini not found in script directory."
    exit 1
}

# =========================================================
# WinSCP Decryption Functions (CORRECT ALGORITHM)
# =========================================================

function DecryptNextCharacterWinSCP($remainingPass) {
    $flagAndPass = "" | Select-Object flag, remainingPass

    $firstval = ("0123456789ABCDEF".IndexOf($remainingPass[0]) * 16)
    $secondval = "0123456789ABCDEF".IndexOf($remainingPass[1])
    $added = $firstval + $secondval

    $decryptedResult = ((-bnot ($added -bxor $Magic) % 256) + 256) % 256

    $flagAndPass.flag = $decryptedResult
    $flagAndPass.remainingPass = $remainingPass.Substring(2)

    return $flagAndPass
}

function DecryptWinSCPPassword($SessionHostname, $SessionUsername, $Password) {
    $CheckFlag = 255
    $Magic = 163
    $key = $SessionHostname + $SessionUsername

    $values = DecryptNextCharacterWinSCP $Password
    $storedFlag = $values.flag

    if ($values.flag -eq $CheckFlag) {
        $values.remainingPass = $values.remainingPass.Substring(2)
        $values = DecryptNextCharacterWinSCP $values.remainingPass
    }

    $len = $values.flag
    $values = DecryptNextCharacterWinSCP $values.remainingPass
    $values.remainingPass = $values.remainingPass.Substring(($values.flag * 2))

    $finalOutput = ""

    for ($i = 0; $i -lt $len; $i++) {
        $values = DecryptNextCharacterWinSCP $values.remainingPass
        $finalOutput += [char]$values.flag
    }

    if ($storedFlag -eq $CheckFlag) {
        return $finalOutput.Substring($key.length)
    }

    return $finalOutput
}

# =========================================================
# Parse WinSCP.ini
# =========================================================

$content = Get-Content $iniPath

$currentUser = ""
$currentHost = ""
$currentSession = ""

$results = @()

foreach ($line in $content) {

    if ($line -match "^\[Sessions\\(.+)\]") {
        $currentSession = $matches[1]
        $currentUser = ""
        $currentHost = ""
    }

    if ($line -match "^UserName=(.*)") {
        $currentUser = $matches[1]
    }

    if ($line -match "^HostName=(.*)") {
        $currentHost = $matches[1]
    }

    if ($line -match "^Password=(.*)") {
        $encPassword = $matches[1]

        if ($currentUser -and $currentHost) {

            $decPassword = DecryptWinSCPPassword `
                $currentHost `
                $currentUser `
                $encPassword

            # Detect environment
            $env = "UNKNOWN"
            if ($currentSession -match "C-(DEV|SQA|PROD|PrePROD)") {
                $env = $matches[1]
            }

            $results += [PSCustomObject]@{
                Environment = $env
                Session     = $currentSession
                UserName    = $currentUser
                Host        = $currentHost
                Password    = $decPassword
            }
        }
    }
}

# =========================================================
# Output
# =========================================================

Write-Host "`n==== WinSCP Decrypted Credentials ====" -ForegroundColor Cyan
$results | Format-Table -AutoSize

# JSON export
$results | ConvertTo-Json -Depth 4 | Out-File $jsonOutputPath -Encoding UTF8

Write-Host "`nJSON exported to: $jsonOutputPath" -ForegroundColor Green
