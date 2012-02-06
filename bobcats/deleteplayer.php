<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
</head>
<body class="mainBody">

<div id="container">
  <div id="mainContent">
    <div class="style1">
    <h1>Delete Player</h1>

<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>


<?php 


error_reporting(E_ALL);
ini_set('display_errors', true);



$dbcnx = @mysql_connect('mysql50-36.wc1.dfw1.stabletransit.com', '496492_th', 'Krul6666');
if (!$dbcnx) {
  exit('<p>Unable to connect to the ' .
      'database server at this time.</p>');
}
 // Select the badgers database
if (!@mysql_select_db('496492_turtlemaster')) {
  exit('<p>Unable to locate the master ' .
      'database at this time.</p>');
}


// This id value will either have been passed by the confirmation form from this page,
// or by the initial call from players.php
$id = $_GET['id'];
	


if (isset($_GET['confirm_delete'])) {

	//  Delete all attendance statuses belonging to the player 
	//  along with the player his/herself
	$ok1 = @mysql_query("DELETE FROM bobcats_attendance WHERE player_id='$id'");
	$ok2 = @mysql_query("DELETE FROM bobcats_player WHERE id='$id'");
		
		
	if ($ok1 AND $ok2) {
		echo '<p>Player deleted successfully!</p>';
	} else {
		echo '<p>Error deleting player from database!<br />' .
  			'Error: ' . mysql_error() . '</p>';
	}
	
	echo '<p><a href="players.php">Return to roster management page</a></p>';
}

else {
	$sql = "SELECT name FROM bobcats_player WHERE id='$id'";
    
	if (!$result=@mysql_query($sql)) {
   		echo '<p>Error accessing database: ' .
        	 mysql_error() . '</p>';
	}
	$row = mysql_fetch_array($result);  // only one row
	$name = htmlspecialchars($row['name']);
	
	?>


	<form action="<?php echo $_SERVER['PHP_SELF']; ?>" method="get">
	<p>Do you really want to delete <?php echo $name; ?> from the roster?</p>
       
	<input type="hidden" name="id" value="<?php echo $id; ?>" />
	<input type="submit" name="confirm_delete" value="YES" />
	<br />
	</form>
	
	<form action="players.php" method="get">
	<input type="submit" value="NO" />
	</form>

	<?php
}

?>

<br />

</div>  
</div>  
</div>  
  
</body>
</html>