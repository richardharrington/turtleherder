<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats
</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
</head>
<body class="oneColElsCtr">

<div id="container">
  <div id="mainContent">
    <div class="style1">
    <h1>Manage Player Roster</h1>

<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>

<?php 


error_reporting(E_ALL);
ini_set('display_errors', true);

$dbcnx = @mysql_connect('mysql50-36.wc1.dfw1.stabletransit.com', '496492_th', 'Krul6666');
if (!$dbcnx) {
	exit ('<p>Unable to connect to the database server at this time.</p>');
	
}

if (!@mysql_select_db('496492_turtlemaster')) {
	exit('<p>Unable to locate the database at this time.</p>');
}

$players = @mysql_query('SELECT id, name FROM bobcats_player ORDER BY name ASC');
if (!$players) {
	exit('<p>Error retrieving players from database!<br />' .
		'Error: ' . mysql_error() . '</p>');
}

while ($player = mysql_fetch_array($players)) {
	$id = $player['id'];
	$name = htmlspecialchars($player['name']);
	echo "<p>$name " .
		"<a href='editplayer.php?id=$id'>Edit</a> " .
		"<a href='deleteplayer.php?id=$id'>Delete</a></p>";
}

?>

<br />
<p><a href="editplayer.php">Add new player</a></p>
<br />

</body>




</div>
</div>
</div>
</body>
</html>